frappe.ui.form.on("Service Ticket", {
  setup: function (frm) {
    // TODO: Filter items based on service order
  },
  refresh: function (frm) {
    start_ticket_button(frm);
    mark_as_resolved_button(frm);
    create_service_invoice_button(frm);
  },
  service_order: function (frm) {
    copy_service_order_items(frm);
  },
  discount_amount: function (frm) {
    calculate_totals(frm);
  },
});

frappe.ui.form.on("Service Ticket Item", {
  item_code: function (frm, cdt, cdn) {
    check_duplicate_item(frm, cdt, cdn);
    validate_item(frm, cdt, cdn);
    calculate_totals(frm);
  },
  qty: function (frm, cdt, cdn) {
    validate_item(frm, cdt, cdn);
    calculate_totals(frm);
  },
});

function start_ticket_button(frm) {
  if (frm.doc.status === "Assigned") {
    frm.add_custom_button("Start Ticket", function () {
      frm.set_value("status", "In Progress");
      frm.save("Update");
    });
  }
}

function mark_as_resolved_button(frm) {
  if (frm.doc.status === "In Progress") {
    frm.add_custom_button("Mark as resolved", function () {
      frm.set_value("status", "Resolved");
      frm.save("Update");
    });
  }
}

function create_service_invoice_button(frm) {
  if (frm.doc.status == "Resolved") {
    frm.add_custom_button(__("Create Service Invoice"), function () {
      let new_doc = frappe.model.get_new_doc("Service Invoice");
      frappe.model.copy_doc(frm.doc, new_doc);
      new_doc.service_ticket = frm.doc.name;
      new_doc.invoice_date = frappe.datetime.nowdate();
      frappe.set_route("Form", "Service Invoice", new_doc.name);
    });
  }
}

function copy_service_order_items(frm) {
  frm.clear_table("items");
  if (frm.doc.service_order) {
    frappe.model.with_doc("Service Order", frm.doc.service_order, function () {
      var service_order = frappe.model.get_doc(
        "Service Order",
        frm.doc.service_order
      );
      let total_amount = 0;

      $.each(service_order.items || [], function (i, item) {
        if (item.assigned_qty < item.qty) {
          var child = frm.add_child("items");
          child.item_code = item.item_code;
          child.item_name = item.item_name;
          child.description = item.description;
          child.uom = item.uom;
          let qty = item.qty - item.assigned_qty;
          child.qty = qty;
          child.rate = item.rate;
          child.amount = item.rate * qty;
          child.service_order = frm.doc.service_order;
          total_amount += child.amount;
        }
      });
      frm.refresh_field("items");
      frm.set_value("sub_total_company", total_amount);
      frm.set_value("sub_total_customer", total_amount * frm.doc.exchange_rate);

      apply_discounts(frm);
    });
  }
}

function validate_item(frm, cdt, cdn) {
  let row = locals[cdt][cdn];
  frappe.model.with_doc("Service Order", frm.doc.service_order, function () {
    var service_order = frappe.model.get_doc(
      "Service Order",
      frm.doc.service_order
    );

    var item_in_order = service_order.items.find(
      (item) => item.item_code === row.item_code
    );

    if (item_in_order) {
      if (item_in_order.assigned_qty < item_in_order.qty) {
        if (row.qty <= item_in_order.qty - item_in_order.assigned_qty) {
          frappe.model.set_value(cdt, cdn, "rate", item_in_order.rate);
          frappe.model.set_value(
            cdt,
            cdn,
            "description",
            item_in_order.description
          );
          frappe.model.set_value(cdt, cdn, "uom", item_in_order.uom);
          if (!row.qty) {
            frappe.model.set_value(
              cdt,
              cdn,
              "qty",
              item_in_order.qty - item_in_order.assigned_qty
            );
          }
          frm.refresh_field("items");
        } else {
          frappe.show_alert(
            {
              indicator: "orange",
              message: __(
                "The quantity for item {0} exceeds the available quantity in the service order. Setting it to the maximum available quantity.",
                [row.item_code]
              ),
            },
            5
          );
          frappe.model.set_value(
            cdt,
            cdn,
            "qty",
            item_in_order.qty - item_in_order.assigned_qty
          );
          frm.refresh_field("items");
        }
      } else {
        frappe.show_alert(
          {
            indicator: "orange",
            message: __(
              "The item {0} has already been assigned. Please select another item.",
              [row.item_code]
            ),
          },
          5
        );
        frm.get_field("items").grid.grid_rows_by_docname[cdn].remove();
        frm.refresh_field("items");
      }
    } else {
      frappe.show_alert(
        {
          indicator: "red",
          message: __(
            "The item {0} does not exist in the service order. Please select a valid item.",
            [row.item_code]
          ),
        },
        5
      );
      frm.get_field("items").grid.grid_rows_by_docname[cdn].remove();
      frm.refresh_field("items");
    }
    frm.refresh_field("items");
  });
}

function check_duplicate_item(frm, cdt, cdn) {
  let current_item = locals[cdt][cdn];
  let duplicate = frm.doc.items.some(
    (item) =>
      item.item_code === current_item.item_code &&
      item.name !== current_item.name
  );

  if (duplicate) {
    frappe.show_alert(
      {
        indicator: "red",
        message: __(
          "The item {0} is already added. Please ensure each item is unique to maintain accurate calculations.",
          [current_item.item_code]
        ),
      },
      5
    );
    frm.get_field("items").grid.grid_rows_by_docname[cdn].remove();
    frm.refresh_field("items");
  } else {
    calculate_totals(frm);
  }
}

function calculate_totals(frm) {
  let total_amount = 0;

  frm.doc.items.forEach((item) => {
    item.amount = item.qty * item.rate;
    total_amount += item.amount;
  });
  frm.refresh_field("items");
  frm.set_value("sub_total_company", total_amount);
  frm.set_value("sub_total_customer", total_amount * frm.doc.exchange_rate);

  apply_discounts(frm);
}

function apply_discounts(frm) {
  let total_discount_customer = 0;
  let total_discount_company = 0;

  if (frm.doc.apply_discount) {
    if (frm.doc.discount_type === "Percentage %") {
      if (frm.doc.discount_percentage > 100) {
        frappe.throw("The value of the percentage field cannot exceed 100");
      } else {
        total_discount_company =
          (frm.doc.discount_percentage / 100) * frm.doc.sub_totals_billing;
      }
    } else if (frm.doc.discount_type === "Amount") {
      if (frm.doc.discount_amount > frm.doc.sub_totals_billing) {
        frappe.throw(
          "The discount amount cannot exceed the subtotal billing amount"
        );
      } else {
        total_discount_company = frm.doc.discount_amount;
      }
    }

    total_discount_customer = total_discount_company * frm.doc.exchange_rate;
  }

  frm.set_value("total_discount_company", total_discount_company);
  frm.set_value("total_discount_customer", total_discount_customer);

  calculate_grand_totals(frm);
}

function calculate_grand_totals(frm) {
  frm.set_value(
    "grand_total_customer",
    frm.doc.sub_total_customer - frm.doc.total_discount_customer
  );
  frm.set_value(
    "grand_total_company",
    frm.doc.sub_total_company - frm.doc.total_discount_company
  );
}
