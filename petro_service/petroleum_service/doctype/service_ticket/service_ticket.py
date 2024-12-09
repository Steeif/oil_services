import frappe
from frappe.model.document import Document


class ServiceTicket(Document):
    def validate(self):
        self.validate_service_order()
        self.validate_service_items()

    def before_submit(self):
        self.status = "Assigned"
        self.update_service_order_items_assigned_qty()
        self.update_service_order_status("In Progress")

    def on_update_after_submit(self):
        if self.status == "Resolved":
            self.update_service_order_items_delivered_qty()
            self.update_service_order_completion_status()

    def on_cancel(self):
        self.status = "Cancelled"
        self.update_service_order_items_assigned_qty(is_cancel=True)
        self.update_service_order_items_delivered_qty(is_cancel=True)
        self.update_service_order_completion_status()

    def validate_service_order(self):
        service_order = frappe.get_doc("Service Order", self.service_order)
        if service_order.completion_status >= 100:
            frappe.throw("Service Order is already completed.")

    def validate_service_items(self):
        service_order_items = frappe.get_all(
            "Service Order Item",
            filters={"parent": self.service_order},
            fields=["item_code", "qty", "assigned_qty"],
        )
        service_order_items_dict = {
            item.item_code: item for item in service_order_items
        }

        seen_items = set()
        for item in self.items:
            if item.item_code in seen_items:
                frappe.throw(
                    f"Duplicate item {item.item_code} found in service ticket."
                )
            seen_items.add(item.item_code)

            if item.item_code not in service_order_items_dict:
                frappe.throw(
                    f"Item {item.item_code} is not present in the service order."
                )

            service_order_item = service_order_items_dict[item.item_code]
            if item.qty + service_order_item.assigned_qty > service_order_item.qty:
                frappe.throw(
                    f"Total quantity for item {item.item_code} across all service tickets cannot exceed the quantity in the service order."
                )

    def update_service_order_items_assigned_qty(self, is_cancel=False):
        service_order_items = frappe.get_all(
            "Service Order Item",
            filters={"parent": self.service_order},
            fields=["name", "item_code", "assigned_qty"],
        )
        for item in self.items:
            for service_order_item in service_order_items:
                if service_order_item.item_code == item.item_code:
                    new_assigned_qty = (
                        service_order_item.assigned_qty - item.qty
                        if is_cancel
                        else service_order_item.assigned_qty + item.qty
                    )
                    frappe.db.set_value(
                        "Service Order Item",
                        service_order_item.name,
                        "assigned_qty",
                        new_assigned_qty,
                    )
                    frappe.db.commit()
                    break

    def update_service_order_items_delivered_qty(self, is_cancel=False):
        service_order_items = frappe.get_all(
            "Service Order Item",
            filters={"parent": self.service_order},
            fields=["name", "item_code", "delivered_qty"],
        )
        for item in self.items:
            for service_order_item in service_order_items:
                if service_order_item.item_code == item.item_code:
                    new_delivered_qty = (
                        service_order_item.delivered_qty - item.qty
                        if is_cancel
                        else service_order_item.delivered_qty + item.qty
                    )
                    frappe.db.set_value(
                        "Service Order Item",
                        service_order_item.name,
                        "delivered_qty",
                        new_delivered_qty,
                    )
                    frappe.db.commit()
                    break

    def update_service_order_completion_status(self):
        service_order_items = frappe.get_all(
            "Service Order Item",
            filters={"parent": self.service_order},
            fields=["qty", "delivered_qty"],
        )
        total_qty = sum(item.qty for item in service_order_items)
        total_delivered_qty = sum(item.delivered_qty for item in service_order_items)
        completion_status = (total_delivered_qty / total_qty) * 100 if total_qty else 0
        frappe.db.set_value(
            "Service Order", self.service_order, "completion_status", completion_status
        )
        if completion_status < 100:
            self.update_service_order_status("In Progress")
        else:
            self.update_service_order_status("Delivered")
        frappe.db.commit()

    def update_service_order_status(self, status):
        frappe.db.set_value("Service Order", self.service_order, "status", status)
        frappe.db.commit()

    def update_service_order_items_completion(self):
        service_order_items = frappe.get_all(
            "Service Order Item",
            filters={"parent": self.service_order},
            fields=["name", "item_code", "qty", "completion_percentage"],
        )
        for item in self.items:
            for service_order_item in service_order_items:
                if service_order_item.item_code == item.item_code:
                    completion_percentage = (
                        service_order_item.completion_percentage
                        + (item.qty / service_order_item.qty) * 100
                    )

                    service_order_item.completion_percentage = completion_percentage
                    frappe.db.set_value(
                        "Service Order Item",
                        service_order_item.name,
                        "completion_percentage",
                        completion_percentage,
                    )
                    frappe.db.commit()
                    break

        return all(item.completion_percentage >= 100 for item in service_order_items)
