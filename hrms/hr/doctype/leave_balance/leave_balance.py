# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class LeaveBalance(Document):
	pass


@frappe.whitelist()
def fetch_overtime_values(doctype, doc_name):
	payroll_period_start_str = frappe.db.get_value("Payroll Settings", "Payroll Settings", "payroll_start")
	payroll_period_end_str = frappe.db.get_value("Payroll Settings", "Payroll Settings", "payroll_end")
	
	doc = frappe.get_doc(doctype, {'name': doc_name})
	return {
		'payroll_start_date':payroll_period_start_str,
		'payroll_end_date': payroll_period_end_str,
		'overtime_start_date': doc.from_date,
		'overtime_end_date': doc.to_date,
		'overtime_hours': doc.total_overtime_hours,
		'overtime_minutes': doc.total_overtime_minutes
	}