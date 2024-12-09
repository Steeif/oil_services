import frappe
from frappe.model.document import Document


class ServiceOrder(Document):
    def validate(self):
        self.validate_service_items()

    def before_submit(self):
        self.status = "Scheduled"
        # TODO: Calculate total server side

    def after_cancel(self):
        self.status = "Cancelled"

    def validate_service_items(self):
        service_item_codes = [item.item_code for item in self.items]
        if len(service_item_codes) != len(set(service_item_codes)):
            frappe.throw("Duplicate service items are not allowed.")