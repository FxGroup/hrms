# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PermittedEmployeeDoctypes(Document):
	def on_update(self):
		prev_doc = self.get_doc_before_save()
		current_doctypes = [item.ref_doctype for item in self.doctypes] if self.doctypes else []
		previous_doctypes = [item.ref_doctype for item in prev_doc.get('doctypes', [])] if prev_doc.get('doctypes') else []
		
		if current_doctypes != previous_doctypes:
			added_doctypes = [doctype for doctype in current_doctypes if doctype not in previous_doctypes]
			removed_doctypes = [doctype for doctype in previous_doctypes if doctype not in current_doctypes]
			
			if removed_doctypes:
				employees_with_perms = frappe.get_all('Employee', 
					filters={
						'user_id': ['!=', ''],
						'create_user_permission': 1
					},
					fields=['name', 'user_id'])
				
				for element in removed_doctypes:
					existing_perms = frappe.get_all('User Permission', filters={
						'applicable_for': element, 
						'apply_to_all_doctypes': 0, 
						'allow': 'Employee', 
						'is_default': 0, 
						'hide_descendants': 0
					}, fields=['name', 'for_value', 'user'])
					
					for perm in existing_perms:
						employee_has_user = any(emp['name'] == perm.get('for_value') for emp in employees_with_perms)
						
						if employee_has_user:
							frappe.delete_doc('User Permission', perm['name'], ignore_permissions=True)
							frappe.db.commit()
			if added_doctypes:
				employees_with_perms = frappe.get_all('Employee', 
					filters={
						'user_id': ['!=', ''],
						'create_user_permission': 1
					},
					fields=['name', 'user_id'])
				
				for element in added_doctypes:
					for employee in employees_with_perms:
						existing_perm = frappe.get_all('User Permission', filters={
							'user': employee['user_id'],
							'allow': 'Employee',
							'for_value': employee['name'],
							'applicable_for': element,
							'apply_to_all_doctypes': 0,
							'is_default': 0,
							'hide_descendants': 0
						})
						
						if not existing_perm:
							user_perm = frappe.get_doc({
								'doctype': 'User Permission',
								'user': employee['user_id'],
								'allow': 'Employee',
								'for_value': employee['name'],
								'applicable_for': element,
								'apply_to_all_doctypes': 0,
								'is_default': 0,
								'hide_descendants': 0
							})
							user_perm.insert(ignore_permissions=True)
							frappe.db.commit()