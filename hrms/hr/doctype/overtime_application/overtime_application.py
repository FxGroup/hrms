# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
import datetime

from frappe.model.document import Document
from hrms.hr.doctype.leave_application.leave_application import get_email, get_message_to, get_leave_schedule
from fxnmrnth import get_site_name
from erpnext import get_default_company
from frappe.utils import (
	cint,
	getdate,
 	date_diff,
   	formatdate,
    get_link_to_form
)
from hrms.hr.utils import (
	set_employee_name,
	validate_active_employee,
)


class OverlapError(frappe.ValidationError):
	pass


class OvertimeApplication(Document):
	def on_change(self):
		prev_doc = self.get_doc_before_save()
		if hasattr(self, 'status') and hasattr(prev_doc, 'status'):
			if prev_doc.status != self.status and self.status == "Approved" and self.overtime_type == "Time in Lieu":
				self.create_leave_balance()

	def after_insert(self):
		user = frappe.session.user
		if user == "Administrator":
			user = "it@rnlabs.com.au"
		
		message_to = get_message_to(self.employee, 0)
		try:
			subject = f"Overtime application for {self.employee_name}"
			self.notify(
				{
					"message_to": message_to,
					"subject": subject,
				}
			)
		except Exception as e:
			frappe.log_error(message=str(e), title="Overtime Application Email Error")
			frappe.msgprint("Email unable to be sent. Please notify leave approver manually")

	def on_submit(self):
		if self.status in ["Open", "Cancelled"]:
			frappe.throw("Only Overtime Applications with status 'Approved' and 'Rejected' can be submitted")

		# notify accounts if approved
		if self.status == "Approved":
			self.notify_accounts()
		elif self.status == "Rejected":
			try:
				message_to = get_message_to(self.employee, 2)
				subject = f"Overtime application for {self.employee_name} - Rejected"
				self.notify(
					{
						"message_to": message_to,
						"subject": subject,
					}
				)
			except Exception as e:
				frappe.log_error(message=str(e), title="Overtime Application Email Error")
				frappe.msgprint("Email unable to be sent. Please notify overtime applicant manually")
		
		self.reload()

	def validate(self):
		validate_active_employee(self.employee)
		set_employee_name(self)
		self.validate_dates()
		self.validate_overtime_overlap()
		self.validate_overtime_hours()

	def validate_overtime_hours(self):
		if self.total_overtime_hours == 0 and self.total_overtime_minutes == 0:
			frappe.throw("Overtime application cannot be 0 Hours and 0 Minutes.<br><br>Please reset the to and from date and enter the overtime amounts in per day.")

	def validate_overtime_overlap(self):
		if not self.name:
			self.name = "New Overtime Application"

		for d in frappe.db.sql(
			"""
   			select
				name, overtime_type, from_date, to_date
			from `tabOvertime Application`
			where employee = %(employee)s and docstatus < 2 and status in ('Open', 'Approved')
			and to_date >= %(from_date)s and from_date <= %(to_date)s
			and name != %(name)s
   			""",
			{
				"employee": self.employee,
				"from_date": self.from_date,
				"to_date": self.to_date,
				"name": self.name,
			},
			as_dict=1
		):
			self.throw_overlap_error(d)

	def throw_overlap_error(self, d):
		form_link = get_link_to_form("Overtime Application", d.name)
		msg = ("Employee {0} has already applied for {1} between {2} and {3} : {4}").format(
			self.employee, d["overtime_type"], formatdate(d["from_date"]), formatdate(d["to_date"]), form_link
		)
		frappe.throw(msg, OverlapError)

	def validate_dates(self):
		if self.from_date and self.to_date and (getdate(self.to_date) < getdate(self.from_date)):
			frappe.throw("To date cannot be before from date")

	def before_cancel(self):
		self.status = "Cancelled"
      
	def on_cancel(self):
		if frappe.db.get_single_value("HR Settings", "send_leave_notification"):
			self.notify_leave_approver()
		self.db_set("workflow_state", "Cancelled")

	def notify_leave_approver(self):
		if self.leave_approver:
			parent_doc = frappe.get_doc("Overtime Application", self.name)
			args = parent_doc.as_dict()

			template = frappe.db.get_single_value("HR Settings", "overtime_approval_notification_template")
			if not template:
				frappe.msgprint(
					("Please set default template for Overtime Approval Notification in HR Settings.")
				)
				return

			email_template = frappe.get_doc("Email Template", template)
			subject = frappe.render_template(email_template.subject, args)
			message = frappe.render_template(email_template.response_, args)
			message_to = get_message_to(self.employee, 1)

			self.notify(
				{
					"message": message,
					"message_to": message_to,
					"subject": subject,
				}
			)

	def notify_accounts(self):
		try:
			applicant_name = self.employee_name
			subject = f"Overtime approval for {applicant_name}"
			company = get_default_company()
			reports_to_user = frappe.db.get_value("Employee", self.employee, "reports_to", cache=True)
			reports_to_email = frappe.db.get_value("Employee", reports_to_user, "user_id", cache=True)
   
			if reports_to_email == "Administrator":
				reports_to_email = "mitch@fxmed.co.nz"
    
			message_to = get_message_to(self.employee, 3)
   
			if (company == "RN Labs" or company == "Therahealth") and "lee-anne@rnlabs.com.au" not in message_to:
				message_to.append("lee-anne@rnlabs.com.au")
    
			for email in ["jyotsana@fxmed.co.nz", "ricky@fxmed.co.nz", reports_to_email]:
				if email not in message_to and email != "amal@fxmed.co.nz":
					message_to.append(email)
     
			self.notify(
				{
					"message_to": message_to,
					"subject":subject
				}
			)
		except Exception as e:
			frappe.log_error(message=str(e), title="Overtime Approval Email Error")
			frappe.msgprint("Email unable to be sent. Please notify accounts manually")

	def notify(self, args):
		args = frappe._dict(args)
		if cint(self.follow_via_email):
			contact = args.message_to
			if not isinstance(contact, list):
				if not args.notify == "employee":
					contact = frappe.get_doc("User", contact).email or contact
     
			site = get_site_name()
			url = f"https://{site}/app/overtime-application/{self.name}"
			sender_email = get_email()
   
			if self.status in ["Approved", "Rejected", "Cancelled"]:
				intro_line = f"{self.employee_name}'s {self.overtime_type} has been {self.status.lower()}."
			else:
				intro_line = f"{self.employee_name} has applied for {self.overtime_type}."
    
			message = (
				"{0}"
				"<br><br>"
				"You can find the overtime application here: <a href='{3}' target='_blank'>{3}</a>"
				"<br><br>"
				"Details:"
				"<br><br>"
				"- Employee - {1}"
				"<br><br>"
				"- Overtime Type - {2}"
				"<br><br>"
				"- From Date - {4}"
				"<br><br>"
				"- To Date - {5}"
				"<br><br>"
				"- Overtime - {6} hrs {7} mins"
				"<br><br>"
				"- Status - {8}"
			).format(intro_line, self.employee_name, self.overtime_type, url, self.from_date, self.to_date, self.total_overtime_hours, self.total_overtime_minutes, self.status)
   
			try:
				frappe.sendmail(
					recipients=contact,
					sender=sender_email,
					subject=args.subject,
					message=message,
				)
				frappe.msgprint(f"Email sent to {contact}")
			except frappe.OutgoingEmailError:
				frappe.msgprint("Email unable to be sent. Please notify relevant parties directly")
				pass

	def create_leave_balance(self):
		frappe.msgprint('Leave balance raised - Placeholder')
  
  
@frappe.whitelist()
def get_number_of_leave_days(
    employee: str, 
	from_date: datetime.date, 
	to_date:datetime.date
) -> float:
	from_date = getdate(from_date)
	to_date = getdate(to_date)

	number_of_days = date_diff(to_date, from_date) + 1	
	from_date = from_date.strftime("%Y-%m-%d")
	to_date = to_date.strftime("%Y-%m-%d")
	leave_days = get_leave_schedule(from_date=from_date, to_date=to_date, employee=employee)

	if leave_days and leave_days.get('leave_table'):
		number_of_days = len([item for item in leave_days.get('leave_table')])

	return number_of_days