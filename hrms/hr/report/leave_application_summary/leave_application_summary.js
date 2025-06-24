// Copyright (c) 2025, Mitch and contributors
// For license information, please see license.txt

frappe.query_reports["Leave Application Summary"] = {
	"filters": [
		{
			fieldname: "id",
			label: __("ID"),
			fieldtype: "Link",
			options: "Leave Application",
		},
		{
			fieldname: "from_date",
			label: __("From Date"),
			fieldtype: "Date",
			reqd: 1
		},
		{
			fieldname: "to_date",
			label: __("To Date"),
			fieldtype: "Date",
			default: moment().format("YYYY-MM-DD"),
			reqd: 1
		},
		{
			fieldname: "employee",
			label: __("Employee"),
			fieldtype: "Link",
			options: "Employee",
			get_query: function() {
				return {
					filters: {
						status: ["!=", "Left"]
					}
				};
			}
		},
		{
			fieldname: "leave_type",
			label: __("Leave Type"),
			fieldtype: "Link",
			options: "Leave Type"
		},
		{
			fieldname: "Leave Approver",
			label: __("Leave Approver"),
			fieldtype: "Link",
			options: "Employee",
			get_query: function() {
				return {
					filters: {
						status: ["!=", "Left"]
					}
				};
			}
		},
		{
			fieldname: "status",
			label: __("Status"),
			fieldtype: "Select",
			options: "\nApproved\nRejected\nCancelled\n"
		},
		{
			fieldname: "half_day",
			label: __("Partial Day Leave"),
			fieldtype: "Check",
			default: 0,
		},
		{
			fieldname: "prev_period",
			label: __("Previous Period Application"),
			fieldtype: "Check",
			default: 0
		}
	],
	onload: function (report) {
		frappe.db.get_value("Payroll Settings", "Payroll Settings", "payroll_start")
			.then(r => {
				if (r && r.message && r.message.payroll_start) {
					report.set_filter_value("from_date", r.message.payroll_start);
				}
			});
	}
};
