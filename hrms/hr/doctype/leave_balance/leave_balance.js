// Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
// For license information, please see license.txt

frappe.ui.form.on("Leave Balance", {
    ref_name: function(frm) {
        return frappe.call({
            method: "hrms.hr.doctype.leave_balance.leave_balance.fetch_overtime_values",
            args: {
                doctype: frm.doc.ref_doctype,
                doc_name: frm.doc.ref_name,
            },
            callback: function (r) {
                if (!r.exc && r.message) {
                    let fields = ['payroll_start_date', 'payroll_end_date', 'overtime_start_date', 'overtime_end_date', 'overtime_hours', 'overtime_minutes'];
                    fields.forEach(val => {
                        frm.set_value(val, r.message[val]);
                    });
                }
            },
        });
    }
});
