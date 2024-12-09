# Copyright (c) 2024, divic.tech and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class ServiceInvoice(Document):
    def validate(self):
        self.validate_service_ticket()
        
    def before_save(self):
        if not self.outstanding_amount:
            self.outstanding_amount = self.grand_total_company

    def before_submit(self):
        self.status = "Unpaid"
        self.create_journal_entry()
        frappe.db.set_value("Service Ticket", self.service_ticket, "status", "Billed")
        service_order_status = frappe.db.get_value(
            "Service Order", self.service_order, "status"
        )
        if service_order_status == "Delivered":
            frappe.db.set_value("Service Order", self.service_order, "status", "Billed")

    def on_update_after_submit(self):
        if self.status in ["Paid", "Partially Paid"]:
            new_status = "Closed" if self.status == "Paid" else "Partially Paid"
            frappe.db.set_value(
                "Service Ticket", self.service_ticket, "status", new_status
            )
            frappe.db.commit()

            service_order_completion = frappe.db.get_value(
                "Service Order", self.service_order, "completion_status"
            )

            if service_order_completion >= 100:
                service_tickets = frappe.get_all(
                    "Service Ticket",
                    filters={
                        "service_order": self.service_order,
                        "docstatus": 1,
                    },
                )

                all_tickets_status = [
                    frappe.db.get_value("Service Ticket", ticket.name, "status")
                    for ticket in service_tickets
                ]

                if all(status == "Closed" for status in all_tickets_status):
                    frappe.db.set_value(
                        "Service Order", self.service_order, "status", "Paid"
                    )
                elif all(
                    status in ["Closed", "Partially Paid"]
                    for status in all_tickets_status
                ):
                    frappe.db.set_value(
                        "Service Order", self.service_order, "status", "Partially Paid"
                    )

    def on_cancel(self):
        self.status = "Cancelled"
        frappe.db.set_value("Service Ticket", self.service_ticket, "status", "Resolved")
        service_order_status = frappe.db.get_value(
            "Service Order", self.service_order, "status"
        )
        if service_order_status in ["Billed", "Partially Paid", "Paid"]:
            frappe.db.set_value(
                "Service Order", self.service_order, "status", "Delivered"
            )
        frappe.db.commit()

    def validate_service_ticket(self):
        service_ticket = frappe.get_doc("Service Ticket", self.service_ticket)
        if service_ticket.status != "Resolved":
            frappe.throw(
                "Service Ticket must be resolved before creating a Service Invoice."
            )

    def create_journal_entry(self):
        settings = frappe.get_cached_doc("Service Settings", "Service Settings")

        if not (settings.default_income_account and settings.default_customer_account):
            frappe.throw(
                "Please add default income and customer accounts in service settings"
            )

        je = frappe.new_doc("Journal Entry")
        je.posting_date = self.invoice_date  # Use invoice_date for journal entry
        je.reference_name = self.name

        if self.custom_multipay == 1: 
            je.multi_currency = 1

        je.append(
            "accounts",
            {
                "account": settings.default_customer_account,
                "party_type": "Customer",
                "party": self.customer,
                "debit": self.grand_total_company,
                "debit_in_account_currency": self.grand_total_company,
                "credit": 0,
                "account_currency": self.company_currency,
            },
        )

        je.append(
            "accounts",
            {
                "account": settings.default_income_account,
                "credit": self.grand_total_company,
                "credit_in_account_currency": self.grand_total_company,
                "debit": 0,
                "account_currency": self.company_currency,
            },
        )

        je.total_debit = self.grand_total_company
        je.total_credit = self.grand_total_company

        je.docstatus = 1
        je.insert()

        frappe.msgprint(f"New Journal Entry {je.name} has been created")


@frappe.whitelist()
def create_payment_entry(service_invoice):
    service_invoice = frappe.get_doc("Service Invoice", service_invoice)

    # Use current date for 'posting_date' in payment entries
    posting_date = frappe.utils.nowdate()

    if service_invoice.custom_multipay:  # Multi-currency payment handling
        # Create Payment Entry for USD portion
        pe_usd = frappe.new_doc("Payment Entry")
        pe_usd.series = "ACC-PAY-.YYYY.-"
        pe_usd.payment_type = "Receive"
        pe_usd.posting_date = posting_date  # Explicitly set posting_date
        pe_usd.party_type = "Customer"
        pe_usd.party = service_invoice.customer
        pe_usd.mode_of_payment = "Cash"
        pe_usd.paid_to = service_invoice.custom_account_paid_to_usd
        pe_usd.paid_from = service_invoice.custom_account_paid_from_usd
        pe_usd.paid_amount = service_invoice.custom_total_portion_in_usd
        pe_usd.received_amount = service_invoice.custom_total_portion_in_usd
        pe_usd.target_exchange_rate = service_invoice.exchange_rate
        pe_usd.append(
            "references",
            {
                "reference_doctype": "Service Invoice",
                "reference_name": service_invoice.name,
                "total_amount": service_invoice.outstanding_amount,
                "outstanding_amount": service_invoice.custom_total_portion_in_usd,
                "allocated_amount": service_invoice.custom_total_portion_in_usd,
                "posting_date": posting_date,  # Add explicitly here as well
            },
        )
        pe_usd.save()
        frappe.msgprint(f"Payment Entry for USD created: {pe_usd.name}")

        # Create Payment Entry for LYD portion
        pe_lyd = frappe.new_doc("Payment Entry")
        pe_lyd.series = "ACC-PAY-.YYYY.-"
        pe_lyd.payment_type = "Receive"
        pe_lyd.posting_date = posting_date
        pe_lyd.party_type = "Customer"
        pe_lyd.party = service_invoice.customer
        pe_lyd.mode_of_payment = "Cash"
        pe_lyd.paid_to = "Cash - UWOSC"  # Default LYD account
        pe_lyd.paid_amount = service_invoice.custom_total_portion_in_lyb
        pe_lyd.received_amount = service_invoice.custom_total_portion_in_lyb
        pe_lyd.target_exchange_rate = service_invoice.exchange_rate
        pe_lyd.append(
            "references",
            {
                "reference_doctype": "Service Invoice",
                "reference_name": service_invoice.name,
                "total_amount": service_invoice.outstanding_amount,
                "outstanding_amount": service_invoice.custom_total_portion_in_lyb,
                "allocated_amount": service_invoice.custom_total_portion_in_lyb,
                "posting_date": posting_date,  # Add explicitly here as well
            },
        )
        pe_lyd.save()
        frappe.msgprint(f"Payment Entry for LYD created: {pe_lyd.name}")

    else:  # Default single-currency payment handling
        pe = frappe.new_doc("Payment Entry")
        pe.series = "ACC-PAY-.YYYY.-"
        pe.payment_type = "Receive"
        pe.posting_date = posting_date
        pe.party_type = "Customer"
        pe.party = service_invoice.customer
        pe.mode_of_payment = "Cash"
        pe.paid_to = "Cash - UWOSC"  # Default account
        pe.paid_amount = service_invoice.outstanding_amount
        pe.received_amount = service_invoice.outstanding_amount
        pe.target_exchange_rate = service_invoice.exchange_rate
        pe.append(
            "references",
            {
                "reference_doctype": "Service Invoice",
                "reference_name": service_invoice.name,
                "total_amount": service_invoice.outstanding_amount,
                "outstanding_amount": 0,
                "allocated_amount": service_invoice.outstanding_amount,
                "posting_date": posting_date,  # Add explicitly here as well
            },
        )
        pe.save()
        frappe.msgprint(f"Payment Entry created: {pe.name}")



@frappe.whitelist()
def get_payment_terms_template(payment_terms_template):
    template = frappe.get_doc("Payment Terms Template", payment_terms_template)
    return template
