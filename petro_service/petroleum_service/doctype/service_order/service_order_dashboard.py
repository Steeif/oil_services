from frappe import _

def get_data():
    return {
        "fieldname": "service_order",
        "transactions": [
            {"label": _("References"), "items": ["Service Ticket", "Service Invoice"]},
        ],
    }
