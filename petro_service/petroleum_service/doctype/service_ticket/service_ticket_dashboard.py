from frappe import _

def get_data():
    return {
        "fieldname": "service_ticket",
        "internal_links": {
			"Service Order": ["items", "service_order"],
        },
        "transactions": [
            {"label": _("References"), "items": ["Service Order", "Service Invoice"]},
        ],
    }
