// 数据层：与小程序端共用同一套云端表与数据库函数，字段映射保持一致
(function () {
    'use strict';

    var App = window.App;

    function asRows(data) {
        return Array.isArray(data) ? data : [];
    }

    function fail(message) {
        return { data: null, error: { message: message || '操作失败' } };
    }

    function client() {
        if (!App.cloud) throw new Error('云端未初始化');
        return App.cloud;
    }

    // 通用表访问：0 行命中视为失败（多为被删或无权限）
    function table(name, columns, fromRow, toRow) {
        var cols = columns.join(',');
        return {
            list: async function (build) {
                try {
                    var query = client().database.from(name).select(cols);
                    if (typeof build === 'function') query = build(query) || query;
                    var res = await query;
                    return { data: asRows(res && res.data).map(fromRow), error: res ? res.error : null };
                } catch (error) {
                    return { data: [], error: { message: (error && error.message) || '读取失败' } };
                }
            },
            create: async function (payload) {
                try {
                    var row = toRow(payload);
                    if (!row || Object.keys(row).length === 0) return fail('没有可提交的字段');
                    var res = await client().database.from(name).insert(row).select(cols);
                    var rows = asRows(res && res.data);
                    if (res && res.error) return { data: null, error: res.error };
                    if (rows.length === 0) return fail('保存未成功，可能无权限');
                    return { data: fromRow(rows[0]), error: null };
                } catch (error) {
                    return fail((error && error.message) || '保存失败');
                }
            },
            update: async function (id, patch) {
                try {
                    var row = toRow(patch);
                    if (!row || Object.keys(row).length === 0) return fail('没有可提交的字段');
                    var res = await client().database.from(name).update(row).eq('id', id).select(cols);
                    var rows = asRows(res && res.data);
                    if (res && res.error) return { data: null, error: res.error };
                    if (rows.length === 0) return fail('没有更新成功，记录可能已被删除或无权修改');
                    return { data: fromRow(rows[0]), error: null };
                } catch (error) {
                    return fail((error && error.message) || '保存失败');
                }
            },
            remove: async function (id) {
                try {
                    var res = await client().database.from(name).delete().eq('id', id).select(cols);
                    var rows = asRows(res && res.data);
                    if (res && res.error) return { data: null, error: res.error };
                    if (rows.length === 0) return fail('删除未生效，记录可能已不存在或无权限');
                    return { data: { removed: rows.length }, error: null };
                } catch (error) {
                    return fail((error && error.message) || '删除失败');
                }
            }
        };
    }

    // ---- 班级 ----
    var classes = table(
        'classes',
        ['id', 'name', 'teacher', 'owner_uid', 'created_at'],
        function (row) {
            return { id: row.id, name: row.name, teacher: row.teacher || '', ownerUid: row.owner_uid || '' };
        },
        function (payload) {
            var row = {};
            if (payload.name) row.name = String(payload.name).trim();
            if (payload.teacher !== undefined) row.teacher = payload.teacher;
            return row;
        }
    );

    // ---- 学生 ----
    var students = table(
        'students',
        ['id', 'name', 'student_no', 'uid', 'points', 'group_id', 'class_id', 'pet', 'pet_name', 'owner_name', 'created_at'],
        function (row) {
            return {
                id: row.id,
                name: row.name,
                studentNo: row.student_no || '',
                uid: row.uid || '',
                points: typeof row.points === 'number' ? row.points : 0,
                groupId: row.group_id,
                classId: row.class_id,
                pet: row.pet,
                petName: row.pet_name,
                ownerName: row.owner_name || ''
            };
        },
        function (payload) {
            var row = {};
            if (payload.name) row.name = String(payload.name).trim();
            if (payload.studentNo !== undefined) row.student_no = payload.studentNo ? String(payload.studentNo).trim() : null;
            if (typeof payload.points === 'number') row.points = payload.points;
            if (payload.groupId !== undefined) row.group_id = payload.groupId;
            if (payload.classId !== undefined) row.class_id = payload.classId;
            if (payload.pet !== undefined) row.pet = payload.pet;
            if (payload.petName !== undefined) row.pet_name = payload.petName;
            if (payload.ownerName !== undefined) row.owner_name = payload.ownerName || null;
            return row;
        }
    );

    // ---- 仙门 ----
    var groups = table(
        'groups',
        ['id', 'name', 'points', 'motto', 'class_id', 'owner_name', 'created_at'],
        function (row) {
            return {
                id: row.id,
                name: row.name,
                points: typeof row.points === 'number' ? row.points : 0,
                motto: row.motto || '',
                classId: row.class_id,
                ownerName: row.owner_name || ''
            };
        },
        function (payload) {
            var row = {};
            if (payload.name) row.name = String(payload.name).trim();
            if (typeof payload.points === 'number') row.points = payload.points;
            if (payload.motto !== undefined) row.motto = payload.motto;
            if (payload.classId !== undefined) row.class_id = payload.classId;
            if (payload.ownerName !== undefined) row.owner_name = payload.ownerName || null;
            return row;
        }
    );

    // ---- 功过记录 ----
    var records = table(
        'records',
        ['id', 'student_id', 'student_name', 'group_id', 'class_id', 'kind', 'category', 'item', 'value', 'week', 'note', 'owner_name', 'created_at'],
        function (row) {
            return {
                id: row.id,
                studentId: row.student_id,
                studentName: row.student_name || '',
                groupId: row.group_id,
                classId: row.class_id,
                kind: row.kind,
                category: row.category,
                item: row.item,
                value: row.value,
                week: row.week,
                note: row.note || '',
                ownerName: row.owner_name || ''
            };
        },
        function (payload) {
            var row = {};
            if (payload.studentId !== undefined) row.student_id = payload.studentId;
            if (payload.studentName !== undefined) row.student_name = payload.studentName;
            if (payload.groupId !== undefined) row.group_id = payload.groupId;
            if (payload.classId !== undefined) row.class_id = payload.classId;
            if (payload.kind) row.kind = payload.kind;
            if (payload.category !== undefined) row.category = payload.category;
            if (payload.item !== undefined) row.item = payload.item;
            if (typeof payload.value === 'number') row.value = payload.value;
            if (payload.week !== undefined) row.week = payload.week;
            if (payload.note !== undefined) row.note = payload.note;
            if (payload.ownerName !== undefined) row.owner_name = payload.ownerName || null;
            return row;
        }
    );

    // ---- 设定 ----
    var settings = table(
        'settings',
        ['id', 'school_name', 'class_name', 'teacher', 'config'],
        function (row) {
            return {
                id: row.id,
                schoolName: row.school_name || '',
                className: row.class_name || '',
                teacher: row.teacher || '',
                config: row.config || {}
            };
        },
        function (payload) {
            var row = {};
            if (payload.schoolName !== undefined) row.school_name = payload.schoolName;
            if (payload.className !== undefined) row.class_name = payload.className;
            if (payload.teacher !== undefined) row.teacher = payload.teacher;
            if (payload.config !== undefined) row.config = payload.config;
            return row;
        }
    );

    // ---- 教师（管理员视图）----
    var teachers = table(
        'teachers',
        ['id', 'uid', 'name', 'phone', 'is_admin', 'created_at'],
        function (row) {
            return { id: row.id, uid: row.uid, name: row.name || '', phone: row.phone || '', isAdmin: row.is_admin === true };
        },
        function (payload) {
            var row = {};
            if (payload.name) row.name = String(payload.name).trim();
            if (payload.phone !== undefined) row.phone = payload.phone;
            if (payload.isAdmin !== undefined) row.is_admin = payload.isAdmin === true;
            return row;
        }
    );

    var teacherClasses = table(
        'teacher_classes',
        ['id', 'teacher_uid', 'class_id', 'role', 'subject', 'created_at'],
        function (row) {
            return {
                id: row.id,
                teacherUid: row.teacher_uid,
                classId: row.class_id,
                role: row.role || 'subject',
                subject: row.subject || ''
            };
        },
        function (payload) {
            var row = {};
            if (payload.teacherUid !== undefined) row.teacher_uid = payload.teacherUid;
            if (payload.classId !== undefined) row.class_id = payload.classId;
            if (payload.role) row.role = payload.role;
            if (payload.subject !== undefined) row.subject = payload.subject;
            return row;
        }
    );

    // ---- RPC ----
    async function rpc(fn, params) {
        try {
            var res = await client().database.rpc(fn, params || {});
            if (res && res.error) return { data: null, error: res.error };
            var value = res ? res.data : null;
            if (Array.isArray(value)) value = value[0];
            return { data: value === undefined ? null : value, error: null };
        } catch (error) {
            return fail((error && error.message) || '调用失败');
        }
    }

    function bumpStudentPoints(studentId, delta) {
        return rpc('bump_student_points', { p_student_id: studentId, p_delta: delta });
    }

    function bumpGroupPoints(groupId, delta) {
        return rpc('bump_group_points', { p_group_id: groupId, p_delta: delta });
    }

    // ---- 考勤 ----
    var ATT_COLS = 'id,class_id,day,slot,period_no,student_id,student_name,status,note,teacher_name,updated_at';

    function attRow(row) {
        return {
            id: row.id,
            classId: row.class_id,
            day: String(row.day || '').slice(0, 10),
            slot: row.slot || 'daily',
            periodNo: typeof row.period_no === 'number' ? row.period_no : 0,
            studentId: row.student_id,
            studentName: row.student_name || '',
            status: row.status || 'present',
            note: row.note || '',
            teacherName: row.teacher_name || ''
        };
    }

    async function attendanceForDay(classId, day, slot, periodNo) {
        if (!classId || !day) return { data: [], error: null };
        try {
            var query = client().database.from('attendance').select(ATT_COLS).eq('class_id', classId).eq('day', day).eq('slot', slot || 'daily');
            if ((slot || 'daily') === 'period') query = query.eq('period_no', periodNo || 1);
            var res = await query.limit(200);
            return { data: asRows(res && res.data).map(attRow), error: res ? res.error : null };
        } catch (error) {
            return { data: [], error: { message: (error && error.message) || '读取失败' } };
        }
    }

    async function attendanceMine(fromDay, toDay, limit) {
        try {
            var res = await client()
                .database.from('attendance')
                .select(ATT_COLS)
                .eq('student_id', App.store.profile.student.id)
                .gte('day', fromDay)
                .lte('day', toDay)
                .order('day', { ascending: false })
                .limit(limit || 120);
            return { data: asRows(res && res.data).map(attRow), error: res ? res.error : null };
        } catch (error) {
            return { data: [], error: { message: (error && error.message) || '读取失败' } };
        }
    }

    async function saveAttendance(classId, day, slot, periodNo, rows) {
        if (!classId || !day) return fail('缺少班级或日期');
        if (!rows || rows.length === 0) return fail('没有可保存的考勤');
        var payload = rows.map(function (r) {
            return { studentId: r.studentId, studentName: r.studentName || '', status: r.status || 'present', note: r.note || '' };
        });
        var res = await rpc('save_attendance', {
            p_class_id: classId,
            p_day: day,
            p_slot: slot || 'daily',
            p_period: periodNo || 0,
            p_rows: payload
        });
        if (res.error) return res;
        return { data: { saved: res.data || 0 }, error: null };
    }

    // ---- 请假 ----
    var LEAVE_COLS = 'id,class_id,student_id,student_no,student_name,type,start_date,end_date,reason,contact,status,reviewer_name,review_note,reviewed_at,created_at';

    function leaveRow(row) {
        return {
            id: row.id,
            classId: row.class_id,
            studentId: row.student_id,
            studentNo: row.student_no || '',
            studentName: row.student_name || '',
            type: row.type || 'other',
            startDate: row.start_date || '',
            endDate: row.end_date || '',
            reason: row.reason || '',
            contact: row.contact || '',
            status: row.status || 'pending',
            reviewerName: row.reviewer_name || '',
            reviewNote: row.review_note || '',
            reviewedAt: row.reviewed_at || '',
            createdAt: row.created_at || ''
        };
    }

    async function leavesMine(limit) {
        try {
            var res = await client()
                .database.from('leaves')
                .select(LEAVE_COLS)
                .eq('student_id', App.store.profile.student.id)
                .order('created_at', { ascending: false })
                .limit(limit || 30);
            return { data: asRows(res && res.data).map(leaveRow), error: res ? res.error : null };
        } catch (error) {
            return { data: [], error: { message: (error && error.message) || '读取失败' } };
        }
    }

    async function leavesByClass(classId, status, limit) {
        if (!classId) return { data: [], error: null };
        try {
            var query = client().database.from('leaves').select(LEAVE_COLS).eq('class_id', classId);
            if (status) query = query.eq('status', status);
            var res = await query.order('created_at', { ascending: false }).limit(limit || 60);
            return { data: asRows(res && res.data).map(leaveRow), error: res ? res.error : null };
        } catch (error) {
            return { data: [], error: { message: (error && error.message) || '读取失败' } };
        }
    }

    async function leavesApprovedOn(classId, day) {
        if (!classId) return { data: [], error: null };
        try {
            var res = await client()
                .database.from('leaves')
                .select(LEAVE_COLS)
                .eq('class_id', classId)
                .eq('status', 'approved')
                .lte('start_date', day)
                .gte('end_date', day)
                .limit(200);
            return { data: asRows(res && res.data).map(leaveRow), error: res ? res.error : null };
        } catch (error) {
            return { data: [], error: { message: (error && error.message) || '读取失败' } };
        }
    }

    async function createLeave(payload) {
        var student = App.store.profile && App.store.profile.student;
        if (!student) return fail('还没绑定学生身份');
        var startDate = String(payload.startDate || '').slice(0, 10);
        var endDate = String(payload.endDate || startDate).slice(0, 10);
        if (!startDate || !endDate) return fail('请选择请假起止日期');
        if (endDate < startDate) return fail('结束日期不能早于开始日期');
        var row = {
            class_id: student.classId,
            student_id: student.id,
            student_no: student.studentNo || null,
            student_name: student.name || '',
            type: payload.type || 'other',
            start_date: startDate,
            end_date: endDate,
            start_at: startDate + 'T00:00:00+08:00',
            end_at: endDate + 'T23:59:59+08:00',
            reason: String(payload.reason || '').trim().slice(0, 200),
            contact: String(payload.contact || '').trim().slice(0, 30),
            status: 'pending'
        };
        try {
            var res = await client().database.from('leaves').insert(row).select(LEAVE_COLS);
            var rows = asRows(res && res.data);
            if (res && res.error) return { data: null, error: res.error };
            if (rows.length === 0) return fail('提交未成功，请确认是否已绑定学生身份');
            return { data: leaveRow(rows[0]), error: null };
        } catch (error) {
            return fail((error && error.message) || '提交失败');
        }
    }

    async function cancelLeave(id) {
        try {
            var res = await client().database.from('leaves').update({ status: 'cancelled' }).eq('id', id).select(LEAVE_COLS);
            var rows = asRows(res && res.data);
            if (res && res.error) return { data: null, error: res.error };
            if (rows.length === 0) return fail('只有待审批的请假可以撤回');
            return { data: leaveRow(rows[0]), error: null };
        } catch (error) {
            return fail((error && error.message) || '撤回失败');
        }
    }

    async function reviewLeave(id, status, note) {
        var res = await rpc('review_leave', { p_leave_id: id, p_status: status, p_note: note || '' });
        if (res.error) return res;
        var value = res.data;
        if (!value || value.ok !== true) return fail((value && value.message) || '审批失败');
        return { data: value, error: null };
    }

    App.data = {
        classes: classes,
        students: students,
        groups: groups,
        records: records,
        settings: settings,
        teachers: teachers,
        teacherClasses: teacherClasses,
        rpc: rpc,
        bumpStudentPoints: bumpStudentPoints,
        bumpGroupPoints: bumpGroupPoints,
        attendanceForDay: attendanceForDay,
        attendanceMine: attendanceMine,
        saveAttendance: saveAttendance,
        leavesMine: leavesMine,
        leavesByClass: leavesByClass,
        leavesApprovedOn: leavesApprovedOn,
        createLeave: createLeave,
        cancelLeave: cancelLeave,
        reviewLeave: reviewLeave
    };
})();
