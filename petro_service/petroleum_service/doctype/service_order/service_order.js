frappe.ui.form.on("Service Order", {
  setup: function (frm) {
    set_items_indicator(frm);
    set_items_filter(frm);
  },
  refresh(frm) {
    create_service_ticket_button(frm);
  },
  exchange_rate: function (frm) {
    calculate_totals(frm);
  },
  apply_discount: function (frm) {
    calculate_totals(frm);
  },
  discount_type: function (frm) {
    calculate_totals(frm);
  },
  discount_percentage: function (frm) {
    calculate_totals(frm);
  },
  discount_amount: function (frm) {
    calculate_totals(frm);
  },
});

frappe.ui.form.on("Service Order Item", {
  qty: function (frm) {
    calculate_totals(frm);
  },
  rate: function (frm) {
    calculate_totals(frm);
  },
  item_code: function (frm, cdt, cdn) {
    check_duplicate_item(frm, cdt, cdn);
  },
});

function set_items_indicator(frm) {
  frm.set_indicator_formatter("item_code", function (doc) {
    if (!doc.assigned_qty) {
      return "orange";
    } else if (doc.delivered_qty < doc.qty) {
      return "yellow";
    } else {
      return "green";
    }
  });
}

function set_items_filter(frm) {
  frm.fields_dict["items"].grid.get_field("item_code").get_query = function (
    _doc,
    _cdt,
    _cdn
  ) {
    let selected_items = frm.doc.items.map((item) => item.item_code);
    return {
      filters: [["Item", "name", "not in", selected_items]],
    };
  };
}

function create_service_ticket_button(frm) {
  if (frm.doc.docstatus === 1) {
    frm.add_custom_button(__("Create Service Ticket"), function () {
      let new_doc = frappe.model.get_new_doc("Service Ticket");
      frappe.model.copy_doc(frm.doc, new_doc);
      new_doc.ticket_date = frappe.datetime.nowdate();
      new_doc.service_order = frm.doc.name;
      frappe.set_route("Form", "Service Ticket", new_doc.name);
    });
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
