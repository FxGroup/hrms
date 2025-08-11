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
	nowdate,
 	date_diff,
  	add_days
)


class OvertimeApplication(Document):
	def on_cancel(self):
		if frappe.db.get_single_value("HR Settings", "send_leave_notification"):
			self.notify_leave_approver()
		self.db_set("workflow_state", "Cancelled")

	def notify_leave_approver(self):
		if self.leave_approver:
			parent_doc = frappe.get_doc("Leave Application", self.name)
			args = parent_doc.as_dict()

			template = frappe.db.get_single_value("HR Settings", "leave_approval_notification_template")
			if not template:
				frappe.msgprint(
					_("Please set default template for Leave Approval Notification in HR Settings.")
				)
				return
			email_template = frappe.get_doc("Email Template", template)
			subject = frappe.render_template(email_template.subject, args)
			message = frappe.render_template(email_template.response_, args)
			message_to = get_message_to(self.employee, 1)

			self.notify(
				{
					# for post in messages
					"message": message,
					"message_to": message_to,
					# for email
					"subject": subject,
				}
			)

	def notify_accounts(self):
		try:
			applicant_name = self.employee_name
			subject = _("Leave approval for {0}").format(applicant_name)
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
			frappe.log_error(message=str(e), title="Leave Approval Email Error")
			frappe.msgprint(_("Email unable to be sent. Please notify accounts manually"))


	def notify(self, args):
		args = frappe._dict(args)
		# args -> message, message_to, subject
		if cint(self.follow_via_email):
			contact = args.message_to
			if not isinstance(contact, list):
				if not args.notify == "employee":
					contact = frappe.get_doc("User", contact).email or contact
			site = get_site_name()
			url = f"https://{site}/app/leave-application/{self.name}"
			sender_email = get_email()
			if self.status in ["Approved", "Rejected", "Cancelled"]:
				intro_line = f"{self.employee_name}'s {self.leave_type} has been {self.status.lower()}."
			else:
				intro_line = f"{self.employee_name} has applied for {self.leave_type}."
			message = _(
				"{0}"
				"<br><br>"
				"You can find the application here: <a href='{3}' target='_blank'>{3}</a>"
				"<br><br>"
				"Details:"
				"<br><br>"
				"- Employee - {1}"
				"<br><br>"
				"- Leave Type - {2}"
				"<br><br>"
				"- From Date - {4}"
				"<br><br>"
				"- To Date - {5}"
				"<br><br>"
				"- Status - {6}"
			).format(intro_line, self.employee_name, self.leave_type, url, self.from_date, self.to_date, self.status)
			try:
				frappe.sendmail(
					recipients=contact,
					sender=sender_email,
					subject=args.subject,
					message=message,
				)
				frappe.msgprint(_("Email sent to {0}").format(contact))
			except frappe.OutgoingEmailError:
				frappe.msgprint("Email unable to be sent. Please notify relevant parties directly")
				pass

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