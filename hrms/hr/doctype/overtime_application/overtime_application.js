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
    },
    async set_employee(frm) {
		if (frm.doc.employee) return;

		const employee = await hrms.get_current_employee(frm);
		if (employee) {
			frm.set_value("employee", employee);
		}
    }
});
