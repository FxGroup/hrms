# Copyright (c) 2025, Mitch and contributors
# For license information, please see license.txt

import frappe


def execute(filters=None):
	filters = frappe._dict(filters or {})
	return LeaveApplicationSummary(filters).run()


class LeaveApplicationSummary:
	def __init__(self, filters):
		self.filters = filters

	def run(self):
		data = self.get_data()
		columns = self.get_columns()
		return columns, data

	def get_columns(self):
		return [
			{
				"label": "Workflow State",
				"fieldname": "workflow_state",
				"fieldtype": "Data",
				"width": 150
			},
			{
				"label": "Leave Application",
				"fieldname": "name",
				"fieldtype": "Link",
				"options": "Leave Application",
				"width": 250
			},
			{
				"label": "Employee",
				"fieldname": "employee",
				"fieldtype": "Link",
				"options": "Employee",
				"width": 250
			},
			{
				"label": "Employee Name",
				"fieldname": "employee_name",
				"fieldtype": "Data",
				"width": 150
			},
			{
				"label": "Leave Type",
				"fieldname": "leave_type",
				"fieldtype": "Link",
				"options": "Leave Type",
				"width": 150
			},
			{
				"label": "Previous Period Application",
				"fieldname": "prev_period_application",
				"fieldtype": "Check",
				"width": 160
			},
			{
				"label": "From Date",
				"fieldname": "from_date",
				"fieldtype": "Date",
				"width": 110
			},
			{
				"label": "To Date",
				"fieldname": "to_date",
				"fieldtype": "Date",
				"width": 110
			},
			{
				'label': 'Half Day',
				'fieldname': 'half_day',
				'fieldtype': 'Check',
				'width': 100
			},
			{
				"label": 'Half Day Date',
				"fieldname": 'half_day_date',
				"fieldtype": 'Date',
				"width": 150
			},
			{
				"label": 'Total Leave Days',
				"fieldname": 'total_leave_days',
				"fieldtype": 'Float',
				"width": 150
			},
			{
				"label": "Total Leave in Hours",
				"fieldname": "total_hours",
				"fieldtype": "Float",
				"width": 160
			},
   			{
				"label": "Leave Hours",
				"fieldname": "total_leave_hours",
				"fieldtype": "Float",
				"width": 130
			},
			{
				"label": "Leave Minutes",
				"fieldname": "total_leave_minutes",
				"fieldtype": "Float",
				"width": 130
			},
			{
				"label": "Leave Approver",
				"fieldname": "leave_approver",
				"fieldtype": "Link",
				"options": "User",
				"width": 170
			},
   			{
				"label": "Approver Comments",
				"fieldname": "approver_comments",
				"fieldtype": "Data",
				"width": 280
			},
			{
				"label": "Additional Information",
				"fieldname": "description",
				"fieldtype": "Data",
				"width": 280
			}
		]
	
	def get_data(self):
		conds = ""

		if self.filters.get('id'):
			conds += f" and name = '{self.filters.get('id')}'"

		if self.filters.get('employee'):
			conds += f" and employee = '{self.filters.get('employee')}'"

		if self.filters.get('leave_type'):
			conds += f" and leave_type = '{self.filters.get('leave_type')}'"

		if self.filters.get('leave_approver'):
			conds += f" and leave_approver = '{self.filters.get('leave_approver')}'"

		if self.filters.get('from_date'):
			conds += f" and to_date >= '{self.filters.get('from_date')}'"

		if self.filters.get('to_date'):
			conds += f" and from_date <= '{self.filters.get('to_date')}'"

		if self.filters.get('status'):
			conds += f" and workflow_state = '{self.filters.get('status')}'"

		if self.filters.get('half_day'):
			conds += f" and half_day = '{self.filters.get('half_day')}'"

		if self.filters.get('prev_period'):
			conds += " and prev_period_application = 1"
   
		conds += " and workflow_state != 'Cancelled'"
		conds += " and workflow_state != 'Rejected'"
  
		data = frappe.db.sql(f"""
			SELECT
				workflow_state,
				name,
				employee,
				employee_name,
				leave_type,
				from_date,
				to_date,
				half_day,
				prev_period_application,
				half_day_date,
				total_leave_days,
				total_leave_minutes,
				total_leave_hours,
				leave_approver,
				approver_comments,
				description
			FROM
				`tabLeave Application`
			WHERE
				1=1
				{conds}
			ORDER BY
				NAME DESC
		""", as_dict=True)
  
		for row in data:
			hours = row.get("total_leave_hours") or 0
			minutes = row.get("total_leave_minutes") or 0
			try:
				row["total_hours"] = round(float(hours) + float(minutes) / 60.0, 2)
			except (TypeError, ValueError):
				row["total_hours"] = 0.0
  
		# Makes that last row of the report readable.
		data.append({
			"workflow_state": "",
			"name": "",
			"employee": "",
			"employee_name": "",
			"leave_type": "",
			"from_date": "",
			"to_date": "",
			"half_day": "",
			"half_day_date": "",
			"total_leave_days": "",
			"total_leave_hours": "",
			"total_leave_minutes": ""
		})

		return data