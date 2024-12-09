frappe.ui.form.on("Payment Entry", {
  setup: function (frm) {
    frm.set_query("reference_doctype", "references", function () {
      let doctypes = ["Journal Entry"];
      if (frm.doc.party_type == "Customer") {
        doctypes = [
          "Sales Order",
          "Sales Invoice",
          "Journal Entry",
          "Dunning",
          "Service Invoice",
        ];
      } else if (frm.doc.party_type == "Supplier") {
        doctypes = ["Purchase Order", "Purchase Invoice", "Journal Entry"];
      }

      return {
        filters: { name: ["in", doctypes] },
      };
    });

    frm.set_query("reference_name", "references", function (doc, cdt, cdn) {
      const child = locals[cdt][cdn];
      const filters = { docstatus: 1, company: doc.company };
      const party_type_doctypes = [
        "Sales Invoice",
        "Sales Order",
        "Purchase Invoice",
        "Purchase Order",
        "Dunning",
        "Service Invoice",
      ];

      if (in_list(party_type_doctypes, child.reference_doctype)) {
        filters[doc.party_type.toLowerCase()] = doc.party;
      }

      return {
        filters: filters,
      };
    });
  },
  validate_reference_document: function (frm, row) {
    var _validate = function (i, row) {
      if (!row.reference_doctype) {
        return;
      }

      if (
        frm.doc.party_type == "Customer" &&
        ![
          "Sales Order",
          "Sales Invoice",
          "Journal Entry",
          "Dunning",
          "Service Invoice",
        ].includes(row.reference_doctype)
      ) {
        frappe.model.set_value(
          row.doctype,
          row.name,
          "reference_doctype",
          null
        );
        frappe.msgprint(
          __(
            "Row #{0}: Reference Document Type must be one of Sales Order, Sales Invoice, Journal Entry, Dunning or Service Invoice",
            [row.idx]
          )
        );
        return false;
      }

      if (
        frm.doc.party_type == "Supplier" &&
        !["Purchase Order", "Purchase Invoice", "Journal Entry"].includes(
          row.reference_doctype
        )
      ) {
        frappe.model.set_value(
          row.doctype,
          row.name,
          "against_voucher_type",
          null
        );
        frappe.msgprint(
          __(
            "Row #{0}: Reference Document Type must be one of Purchase Order, Purchase Invoice or Journal Entry",
            [row.idx]
          )
        );
        return false;
      }
    };

    if (row) {
      _validate(0, row);
    } else {
      $.each(frm.doc.vouchers || [], _validate);
    }
  },
});

frappe.ui.form.on("Payment Entry Reference", {
  reference_name: function (frm, cdt, cdn) {
    var row = locals[cdt][cdn];
    if (row.reference_name && row.reference_doctype) {
      return frappe.call({
        method:
          "petro_service.overrides.payment_entry.get_reference_details",
        args: {
          reference_doctype: row.reference_doctype,
          reference_name: row.reference_name,
          party_account_currency:
            frm.doc.payment_type == "Receive"
              ? frm.doc.paid_from_account_currency
              : frm.doc.paid_to_account_currency,
          party_type: frm.doc.party_type,
          party: frm.doc.party,
        },
        callback: function (r, rt) {
          if (r.message) {
            $.each(r.message, function (field, value) {
              frappe.model.set_value(cdt, cdn, field, value);
            });

            let allocated_amount =
              frm.doc.unallocated_amount > row.outstanding_amount
                ? row.outstanding_amount
                : frm.doc.unallocated_amount;

            frappe.model.set_value(
              cdt,
              cdn,
              "allocated_amount",
              allocated_amount
            );
            frm.refresh_fields();
          }
        },
      });
    }
  },
});
