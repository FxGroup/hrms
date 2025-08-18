// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.ui.form.on("Leave Application", {
	setup: function (frm) {
		frm.set_query("leave_approver", function () {
			return {
				query: "hrms.hr.doctype.department_approver.department_approver.get_approvers",
				filters: {
					employee: frm.doc.employee,
					doctype: frm.doc.doctype,
				},
			};
		});
		frm.set_query("employee", erpnext.queries.employee);
	},

	onload: function (frm) {
		frm.toggle_display('section_break_7', frappe.user.has_role("Leave Approver") || frappe.user.has_role("HR Manager"));
		
		// Ignore cancellation of doctype on cancel all.
		frm.ignore_doctypes_on_cancel_all = ["Leave Ledger Entry"];

		if (!frm.doc.posting_date) {
			frm.set_value("posting_date", frappe.datetime.get_today());
		}
		if (frm.doc.docstatus == 0) {
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_mandatory_approval",
				args: {
					doctype: frm.doc.doctype,
				},
				callback: function (r) {
					if (!r.exc && r.message) {
						frm.toggle_reqd("leave_approver", true);
					}
				},
			});
		}
	},

	validate: function (frm) {
		if (frm.doc.from_date === frm.doc.to_date && cint(frm.doc.half_day)) {
			frm.doc.half_day_date = frm.doc.from_date;
		} else if (frm.doc.half_day === 0) {
			frm.doc.half_day_date = "";
		}

		frm.toggle_reqd("half_day_date", cint(frm.doc.half_day));

		if (frm.doc.from_date && frm.doc.to_date) {
			validateDateRange(frm);
		}
	},

	make_dashboard: function (frm) {
		let leave_details;
		let lwps;

		if (frm.doc.employee) {
			frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_leave_details",
				async: false,
				args: {
					employee: frm.doc.employee,
					date: frm.doc.from_date || frm.doc.posting_date,
				},
				callback: function (r) {
					if (!r.exc && r.message["leave_allocation"]) {
						leave_details = r.message["leave_allocation"];
					}
					lwps = r.message["lwps"];
				},
			});

			$("div").remove(".form-dashboard-section.custom");

			frm.dashboard.add_section(
				frappe.render_template("leave_application_dashboard", {
					data: leave_details,
				}),
				__("Allocated Leaves"),
			);
			frm.dashboard.show();

			let allowed_leave_types = Object.keys(leave_details);
			// lwps should be allowed for selection as they don't have any allocation
			allowed_leave_types = allowed_leave_types.concat(lwps);

			frm.set_query("leave_type", function () {
				return {
					filters: [["leave_type_name", "in", allowed_leave_types]],
				};
			});
		}
	},

	refresh: function (frm) {
		hrms.leave_utils.add_view_ledger_button(frm);
		if (frm.is_new()) {
			frm.trigger("calculate_total_days");
		}

		frm.set_intro("");
		if (frm.doc.__islocal && !in_list(frappe.user_roles, "Employee")) {
			frm.set_intro(__("Fill the form and save it"));
		} else if (
			frm.perm[0] &&
			frm.perm[0].submit &&
			!frm.is_dirty() &&
			!frm.is_new() &&
			!frappe.model.has_workflow(frm.doctype) &&
			frm.doc.docstatus === 0
		) {
			frm.set_intro(__("Submit this Leave Application to confirm."));
		}

		frm.trigger("set_employee");

		frm.toggle_display('partial_hours_leave', frm.doc.half_day_date);
		frm.toggle_display('partial_minutes_leave', frm.doc.half_day);

		if (frm.doc.leave_days && frm.doc.leave_days.length === 0) {
			frm.toggle_display('leave_days', false);
			frm.toggle_display('total_leave_hours', false);
			frm.toggle_display('total_leave_minutes', false);
		}
		frm.trigger("set_form_buttons");
	},

	async set_employee(frm) {
		if (frm.doc.employee) return;

		const employee = await hrms.get_current_employee(frm);
		if (employee) {
			frm.set_value("employee", employee);
		}
	},

	employee: function (frm) {
		//frm.trigger("make_dashboard");
		frm.trigger("get_leave_balance");
		frm.trigger("set_leave_approver");
	},

	leave_approver: function (frm) {
		if (frm.doc.leave_approver) {
			frm.set_value("leave_approver_name", frappe.user.full_name(frm.doc.leave_approver));
		}
	},

	leave_type: function (frm) {
		frm.trigger("get_leave_balance");
	},

	half_day: function (frm) {
		if (frm.doc.half_day) {
			frm.set_df_property("partial_minutes_leave", "reqd", 1);
			frm.set_df_property("partial_hours_leave", "reqd", 1);
			if (frm.doc.from_date == frm.doc.to_date) {
				frm.set_value("half_day_date", frm.doc.from_date);
			} else {
				frm.trigger("half_day_datepicker");
			}
		} else {
			frm.set_value("half_day_date", "");
			frm.set_value("partial_hours_leave", 0);
			frm.set_value("partial_minutes_leave", 0);
			frm.set_df_property("partial_minutes_leave", "reqd", 0);
			frm.set_df_property("partial_hours_leave", "reqd", 0);
		}

		frm.trigger("calculate_total_days");
	},

	from_date: function (frm) {
		if (!frm.doc.leave_type) {
			frm.doc['from_date'] = undefined;
			frm.doc['to_date'] = undefined;
			frm.refresh_field('from_date');
			frm.refresh_field('to_date');
			frappe.throw(__("Please select a Leave Type before selecting From Date."));
		}

		if (!frm.doc.employee) {
			frm.doc['from_date'] = undefined;
			frm.doc['to_date'] = undefined;
			frm.refresh_field('from_date');
			frm.refresh_field('to_date');
			frappe.throw(__("Please select an Employee before selecting To Date."));
		}
		// frm.events.validate_from_to_date(frm, "from_date");		
		frm.events.validate_from_to_date(frm, "to_date");
		//frm.trigger("make_dashboard");
		frm.trigger("half_day_datepicker");
		frm.trigger("calculate_total_days");
	},

	to_date: function (frm) {
		if (!frm.doc.leave_type) {
			frm.doc['from_date'] = undefined;
			frm.doc['to_date'] = undefined;
			frm.refresh_field('from_date');
			frm.refresh_field('to_date');
			frappe.throw(__("Please select a Leave Type before selecting To Date."));
		}

		if (!frm.doc.employee) {
			frm.doc['from_date'] = undefined;
			frm.doc['to_date'] = undefined;
			frm.refresh_field('from_date');
			frm.refresh_field('to_date');
			frappe.throw(__("Please select an Employee before selecting To Date."));
		}
		// frm.events.validate_from_to_date(frm, "to_date");
		frm.events.validate_from_to_date(frm, "from_date");
		//frm.trigger("make_dashboard");
		frm.trigger("half_day_datepicker");
		frm.trigger("calculate_total_days");
	},

	half_day_date(frm) {
		frm.toggle_display('partial_hours_leave', frm.doc.half_day);
		frm.toggle_reqd('partial_hours_leave', frm.doc.half_day);
		frm.toggle_display('partial_minutes_leave', frm.doc.half_day);
		frm.toggle_reqd('partial_minutes_leave', frm.doc.half_day);

		frm.trigger("calculate_total_days");
	},

	partial_hours_leave(frm) {
		let val = frm.doc.partial_hours_leave;
	
		if (val !== undefined && val !== null) {
			val = Math.floor(Number(val));
			if (isNaN(val) || val < 0) {
				frappe.msgprint(__('Please enter a positive whole number for Partial Hours Leave.'));
				frm.set_value('partial_hours_leave', 0);
			} else {
				frm.set_value('partial_hours_leave', val);
			}
		} else {
			frm.set_value('partial_hours_leave', 0);
		}
	
		frm.trigger("calculate_total_days");
	},

	partial_minutes_leave(frm) {
		frm.trigger("calculate_total_days");
	},

	validate_from_to_date: function (frm, updated_field) {
		if (!frm.doc.from_date || !frm.doc.to_date) return;

		const from_date = Date.parse(frm.doc.from_date);
		const to_date = Date.parse(frm.doc.to_date);

		if (to_date < from_date) {
			const other_field = updated_field === "from_date" ? "to_date" : "from_date";

			frm.set_value(other_field, frm.doc[updated_field]);
			frappe.show_alert({
				message: __("Changing '{0}' to {1}.", [
					__(frm.fields_dict[other_field].df.label),
					frappe.datetime.str_to_user(frm.doc[updated_field]),
				]),
				indicator: "blue",
			});
		}
	},

	half_day_datepicker: function (frm) {
		frm.set_value("half_day_date", "");
		if (!(frm.doc.half_day && frm.doc.from_date && frm.doc.to_date)) return;

		const half_day_datepicker = frm.fields_dict.half_day_date.datepicker;
		half_day_datepicker.update({
			minDate: frappe.datetime.str_to_obj(frm.doc.from_date),
			maxDate: frappe.datetime.str_to_obj(frm.doc.to_date),
		});
	},

	get_leave_balance: function (frm) {
		if (
			frm.doc.docstatus === 0 &&
			frm.doc.employee &&
			frm.doc.leave_type &&
			frm.doc.from_date &&
			frm.doc.to_date
		) {
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_leave_balance_on",
				args: {
					employee: frm.doc.employee,
					date: frm.doc.from_date,
					to_date: frm.doc.to_date,
					leave_type: frm.doc.leave_type,
					consider_all_leaves_in_the_allocation_period: 1,
				},
				callback: function (r) {
					if (!r.exc && r.message) {
						frm.set_value("leave_balance", r.message);
					} else {
						frm.set_value("leave_balance", "0");
					}
				},
			});
		}
	},

	calculate_total_days: function (frm) {
		if (frm.doc.from_date && frm.doc.to_date && frm.doc.employee && frm.doc.leave_type) {
			// server call is done to include holidays in leave days calculations
			return frappe.call({
				method: "hrms.hr.doctype.leave_application.leave_application.get_number_of_leave_days",
				args: {
					employee: frm.doc.employee,
					leave_type: frm.doc.leave_type,
					from_date: frm.doc.from_date,
					to_date: frm.doc.to_date,
					half_day: frm.doc.half_day,
					half_day_date: frm.doc.half_day_date,
					partial_hours_leave: frm.doc.partial_hours_leave || 0,
					partial_minutes_leave: frm.doc.partial_minutes_leave || 0
				},
				callback: function (r) {
					if (r && 'message' in r) {
						frm.set_value("total_leave_days", r.message);
						frm.trigger('set_work_days');
						frm.trigger("get_leave_balance");
					}
				},
			});
		}
	},

	set_work_days: function(frm) {
		if (frm.doc.total_leave_days) {
			frm.clear_table('leave_days');
		}
		
		frappe.call({
			method: "hrms.hr.doctype.leave_application.leave_application.get_leave_schedule",
			args: {
				employee: frm.doc.employee,
				from_date: frm.doc.from_date,
				to_date: frm.doc.to_date,
				half_day: frm.doc.half_day,
				half_day_date: frm.doc.half_day_date,
				partial_hours_leave: frm.doc.partial_hours_leave || 0,
				partial_minutes_leave: frm.doc.partial_minutes_leave || 0
			},
			callback: function(r) {
				if (r && r.message) {
					frm.set_value('leave_days', r.message.leave_table);
					frm.set_value('total_leave_hours', r.message.total_leave_hours);
					frm.set_value('total_leave_minutes', r.message.total_leave_minutes);

					frm.toggle_display('leave_days', true);
					frm.toggle_display('total_leave_hours', true);
					frm.toggle_display('total_leave_minutes', true);
				}
			}
		})
	},

	set_leave_approver: function (frm) {
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
	set_form_buttons: async function (frm) {
		let self_approval_not_allowed = frm.doc.__onload
			? frm.doc.__onload.self_leave_approval_not_allowed
			: 0;
		let current_employee = await hrms.get_current_employee();
		if (
			frm.doc.docstatus === 0 &&
			!frm.is_dirty() &&
			!frappe.model.has_workflow(frm.doctype)
		) {
			if (self_approval_not_allowed && current_employee == frm.doc.employee) {
				frm.set_df_property("status", "read_only", 1);
				frm.trigger("show_save_button");
			}
		}
	},
	show_save_button: function (frm) {
		frm.page.set_primary_action("Save", () => {
			frm.save();
		});
		$(".form-message").prop("hidden", true);
	},
});

frappe.tour["Leave Application"] = [
	{
		fieldname: "employee",
		title: "Employee",
		description: __("Select the Employee."),
	},
	{
		fieldname: "leave_type",
		title: "Leave Type",
		description: __(
			"Select type of leave the employee wants to apply for, like Sick Leave, Privilege Leave, Casual Leave, etc.",
		),
	},
	{
		fieldname: "from_date",
		title: "From Date",
		description: __("Select the start date for your Leave Application."),
	},
	{
		fieldname: "to_date",
		title: "To Date",
		description: __("Select the end date for your Leave Application."),
	},
	{
		fieldname: "half_day",
		title: "Half Day",
		description: __("To apply for a Half Day check 'Half Day' and select the Half Day Date"),
	},
	{
		fieldname: "leave_approver",
		title: "Leave Approver",
		description: __(
			"Select your Leave Approver i.e. the person who approves or rejects your leaves.",
		),
	},
];

function validateDateRange(frm) {
	frappe.db.get_value("Payroll Settings", { name: "Payroll Settings" }, "payroll_start", (r) => {
		if (r && r.payroll_start && (frm.doc.to_date < r.payroll_start || frm.doc.from_date < r.payroll_start)) {
			if (frm.doc.leave_days.length >= 14) {
				frappe.msgprint(__("You cannot apply for more than 14 days of leave before the payroll period starts."));
				frm.set_value("from_date", undefined);
				frm.set_value("to_date", undefined);
				frm.set_value("leave_days", []);
				frm.set_value("total_leave_hours", 0);
				frm.set_value("total_leave_minutes", 0);
				frm.set_value("total_leave_days", 0);
				frm.toggle_display('leave_days', false);
				frm.toggle_display('total_leave_hours', false);
				frm.toggle_display('total_leave_minutes', false);
				return;
			}
			
			frappe.validated = false;

			const original_from = frm.doc.from_date;
			const original_to = frm.doc.to_date;
			const original_hours = frm.doc.total_leave_hours || 0;
			const original_minutes = frm.doc.total_leave_minutes || 0;
			const original_half_day = frm.doc.half_day || 0;
			const partial_day_date = frm.doc.half_day_date || "";
			const partial_hours_leave = frm.doc.partial_hours_leave || 0;
			const partial_minutes_leave = frm.doc.partial_minutes_leave || 0;

			frappe.confirm(
				"You are submitting this application before the current payroll period. We only allow applications within the current payroll period.<br><br>Would you like to adjust the dates to fit within the current period?",
				function () {
					frappe.call({
						method: "hrms.hr.doctype.leave_application.leave_application.get_leave_range",
						args: {
							employee: frm.doc.employee,
							from_date: original_from,
							to_date: original_to,
							total_hours_leave: original_hours,
							total_minutes_leave: original_minutes,
							half_day: original_half_day,
							partial_day_date: partial_day_date,
							partial_hours_leave: partial_hours_leave,
							partial_minutes_leave: partial_minutes_leave,
							leave_days: frm.doc.leave_days || [],
						},
						callback: function (res) {
							if (res && res.message) {
								frm.doc['from_date'] = res.message.start_date;
								frm.doc['to_date'] = res.message.end_date;
								frm.doc['total_leave_hours'] = res.message.total_leave_hours;
								frm.doc['total_leave_minutes'] = res.message.total_leave_minutes;

								if (frm.doc.half_day) {
									frm.doc['half_day_date'] = res.message.adjusted_partial_day_date;
									frm.refresh_field('half_day_date');
								}

								frm.clear_table('leave_days');
								frm.set_value('leave_days', res.message.leave_table || []);
								frm.set_value('total_leave_days', res.message.total_leave_days || 0);
								frm.set_value('total_leave_days', res.message.total_leave_days || 0);
								frm.refresh_field('from_date');
								frm.refresh_field('to_date');
								frm.refresh_field('total_leave_hours');
								frm.refresh_field('total_leave_minutes');

								let note = frm.doc.description ? `${frm.doc.description}\n` : "";
								note += `User confirmed early submission before payroll period. Original dates: ${original_from} to ${original_to}, totaling ${original_hours}h ${original_minutes}m. New application period is from ${res.message.start_date} to ${res.message.end_date}.`;
								frm.set_value("description", note);

								frappe.show_alert({
									message: __("Leave application dates were adjusted. Please save again."),
									indicator: "blue"
								});
							} else {
								frappe.msgprint("Could not rebuild leave schedule. Please try again.");
							}
						}
					});
				},
				function () {
					["leave_days", "total_leave_hours", "total_leave_minutes", "total_leave_days"].forEach((field) => {
						frm.set_value(field, null);
						frm.toggle_display(field, false);
					});

					frm.set_value("from_date", undefined);
					frm.set_value("to_date", undefined);
					frm.set_value("half_day", 0);
					frm.set_value("total_leave_days", 0);
					frm.set_value("partial_hours_leave", undefined);
					frm.set_value("partial_minutes_leave", 0);
					frappe.validated = false;
				}
			);
		}
	});
}
