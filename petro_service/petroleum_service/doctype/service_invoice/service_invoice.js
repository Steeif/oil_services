frappe.ui.form.on("Service Invoice", {
  refresh: function (frm) {
    make_payment_button(frm);
  },
  service_ticket: function (frm) {
    copy_service_ticket_items(frm);
    set_payment_schedule(frm);
  },
  payment_terms_template: function (frm) {
    set_payment_schedule(frm);
  },
  customer: function (frm) {
    set_payment_terms_from_customer(frm);
  },
});

function make_payment_button(frm) {
  if (frm.doc.status === "Unpaid" || frm.doc.status === "Partially Paid") {
    frm.add_custom_button("Make Payment", function () {
      frappe.call({
        method:
          "petro_service.petroleum_service.doctype.service_invoice.service_invoice.create_payment_entry",
        args: {
          service_invoice: frm.doc.name,
        },
        callback: function (r) {
          if (r.message) {
            frappe.set_route("Form", "Payment Entry", r.message);
          }
        },
      });
    });
  }
}
function copy_service_ticket_items(frm) {
  frm.clear_table("items");
  if (frm.doc.service_ticket) {
    frappe.call({
      method: "frappe.client.get",
      args: {
        doctype: "Service Ticket",
        name: frm.doc.service_ticket,
      },
      callback: function (r) {
        if (r.message) {
          var service_ticket = r.message;
          $.each(service_ticket.items || [], function (i, item) {
            var child = frm.add_child("items");
            child.item_code = item.item_code;
            child.item_name = item.item_name;
            child.description = item.description;
            child.uom = item.uom;
            child.qty = item.qty;
            child.rate = item.rate;
            child.amount = item.amount;
            child.service_order = item.service_order;
            child.service_ticket = frm.doc.service_ticket;
          });
          frm.refresh_field("items");
        }
      },
    });
  }
}

function set_payment_schedule(frm) {
  if (frm.doc.payment_terms_template && frm.doc.service_ticket) {
    frappe.call({
      method: "frappe.client.get",
      args: {
        doctype: "Payment Terms Template",
        name: frm.doc.payment_terms_template,
      },
      callback: function (r) {
        if (r.message) {
          var payment_terms_template = r.message;
          frm.clear_table("payment_schedule");
          $.each(payment_terms_template.terms || [], function (i, term) {
            var child = frm.add_child("payment_schedule");
            child.payment_term = term.payment_term;
            child.mode_of_payment = term.mode_of_payment;
            child.invoice_portion = term.invoice_portion;
            child.payment_amount =
              frm.doc.grand_total_company * (term.invoice_portion / 100);
          });
          frm.refresh_field("payment_schedule");
        }
      },
    });
  }
}

function set_payment_terms_from_customer(frm) {
  if (frm.doc.customer) {
    frappe.call({
      method: "frappe.client.get",
      args: {
        doctype: "Customer",
        name: frm.doc.customer,
      },
      callback: function (r) {
        if (r.message) {
          frm.set_value("payment_terms_template", r.message.payment_terms || "");
        }
      },
    });
  } else {
    frm.set_value("payment_terms_template", "");
  }
}
