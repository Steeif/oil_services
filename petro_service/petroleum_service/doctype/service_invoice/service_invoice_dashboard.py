from frappe import _

def get_data():
    return {
        "fieldname": "service_invoice",
        "non_standard_fieldnames": {
            "Payment Entry": "reference_name",
            "Journal Entry": "reference_name",
        },
        "internal_links": {
            "Service Order": ["items", "service_order"],
            "Service Ticket": ["items", "service_ticket"],
        },
        "transactions": [
            {
                "label": _("References"),
                "items": ["Service Order", "Service Ticket", "Payment Entry", "Journal Entry"],
            },
        ],
    }
