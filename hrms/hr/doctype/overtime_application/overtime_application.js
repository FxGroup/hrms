// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Overtime Application", {
    onload: function(frm) {
        frm.toggle_display('section_break_2', frappe.user.has_role("Leave Approver") || frappe.user.has_role("HR Manager"));
		
        if (!frm.doc.posting_date) {
			frm.set_value("posting_date", frappe.datetime.get_today());
		}
    },
    refresh: function(frm) {
        frm.trigger("set_employee");
		if (frm.is_new()) {
			frm.trigger("calculate_total_days");
		}
    },
    async set_employee(frm) {
		if (frm.doc.employee) return;

		const employee = await hrms.get_current_employee(frm);
		if (employee) {
			frm.set_value("employee", employee);
		}
    },
    employee: function(frm) {
        frm.trigger("set_leave_approver");
    },
	from_date: function(frm) {
		frm.trigger("calculate_total_days");
	},
	to_date: function (frm) {
		frm.trigger('calculate_total_days');
	},
    set_leave_approver: function(frm) {
        if (frm.doc.employee) {
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_leave_approver",
				args: {
					employee: frm.doc.employee,
				},
				callback: function (r) {
					if (r && r.message) {
						frm.set_value("leave_approver", r.message.leave_approver);

						if (r.message.additional_approvers && r.message.additional_approvers.length >= 1) {
							r.message.additional_approvers.forEach((approver) => {
								frm.add_child("additional_leave_approvers", {
									leave_approver: approver.leave_approver,
									notification_level: approver.notification_level,
								});
							})
						} else {
							frm.clear_table("additional_leave_approvers");
						}

						frm.refresh_field("additional_leave_approvers");
					}
				},
			});
		}
    },
    calculate_total_days: function (frm) {
		if (frm.doc.from_date && frm.doc.to_date && frm.doc.employee && frm.doc.overtime_type) {
			return frappe.call({
				method: "hrms.hr.doctype.overtime_application.overtime_application.get_number_of_leave_days",
				args: {
					employee: frm.doc.employee,
					from_date: frm.doc.from_date,
					to_date: frm.doc.to_date,
				},
				callback: function (r) {
					if (r && r.message) {
						frm.set_value("total_overtime_days", r.message);
						frm.trigger('set_work_days');
					}
				},
			});
		}
	},
	set_work_days: function(frm) {
		if (frm.doc.total_overtime_days) {
			frm.clear_table('leave_days');

			frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_leave_schedule",
				args: {
					employee: frm.doc.employee,
					from_date: frm.doc.from_date,
					to_date: frm.doc.to_date,
					zero_hours: 1
				},
				callback: function(r) {
					if (r && r.message) {
						frm.set_value('overtime_days', r.message.leave_table);
						frm.set_value('total_overtime_hours', r.message.total_leave_hours);
						frm.set_value('total_overtime_minutes', r.message.total_leave_minutes);
					}
				}
			})
		}
	},
});

frappe.ui.form.on('Work Day Schedule', {
	hours: function(frm, cdt, cdn) {
		calculate_overtime(frm);
	},
	minutes: function(frm, cdt, cdn) {
		calculate_overtime(frm);
	},
	before_overtime_days_remove: function(frm, cdt, cdn) {
		calculate_overtime_day(frm);
		calculate_overtime(frm);
	},
	before_overtime_days_add: function(frm, cdt, cdn) {
		calculate_overtime_day(frm);
		calculate_overtime(frm);
	}
});

function calculate_overtime(frm) {
	let total_hours = 0;
	let total_minutes = 0;
	
	for (let i = 0; i < frm.doc.overtime_days.length; i++) {
		let row = frm.doc.overtime_days[i];
		
		total_hours += parseFloat(row.hours || 0);
		total_minutes += parseFloat(row.minutes || 0);
	}
	
	total_hours += Math.floor(total_minutes / 60);
	total_minutes = total_minutes % 60;
	
	frm.set_value('total_overtime_hours', total_hours);
	frm.set_value('total_overtime_minutes', total_minutes);
}

function calculate_overtime_day(frm) {
	if (frm.doc.overtime_days) {
		frm.set_value("total_overtime_days", frm.doc.overtime_days.length);
	} else {
		frm.set_value('total_overtime_days', 0);
		frm.set_value('total_overtime_hours', 0);
		frm.set_value('total_overtime_minutes', 0);

		frm.toggle_display('total_overtime_days', 0);
		frm.toggle_display('total_overtime_hours', 0);
		frm.toggle_display('total_overtime_minutes', 0);
	}
}