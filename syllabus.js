/**
 * Do2Date — syllabus reading, policies, and key-date import.
 *
 * Kept in its own file rather than folded into script.js for one reason: this
 * is the only part of the app that talks to a server, and it should be obvious
 * from the file list that everything else still runs entirely in the browser.
 *
 * The single hook into script.js is one line inside render(), which calls
 * Do2DateSyllabus.sectionHtml(). Everything else — parse state, policy cards,
 * the import review screen — lives here and writes back through the same
 * `classes` array and save() that the rest of the app uses. There is no second
 * store, and the server never writes a student's data.
 */
(function () {
  "use strict";

  var D = window.Do2DateDates;

  // ---------------------------------------------------------------------
  // Escaping
  //
  // The rest of script.js interpolates class and assignment names straight
  // into innerHTML. That is a live XSS hole — a class named
  // `<img src=x onerror=...>` executes — and it is worth fixing there too, but
  // NOTHING in this file goes unescaped, because this file renders text a
  // language model produced from a document a stranger may have written.
  // ---------------------------------------------------------------------
  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Strings that mean "there is no value here".
   *
   * A model constrained to return a string will always return *a* string. When
   * a field genuinely has no value it reaches for a sentinel — "N/A", "none",
   * an empty string — and which one it picks varies between runs. The schema
   * makes these fields nullable so new parses can say null properly; this
   * catches the drift when they don't.
   */
  var EMPTY_SENTINELS = [
    "", "-", "—", "–", "n/a", "na", "none", "null", "undefined",
    "not stated", "not specified", "not given", "unspecified",
  ];

  function isMeaningful(value) {
    if (value === null || value === undefined) return false;
    return EMPTY_SENTINELS.indexOf(String(value).trim().toLowerCase()) === -1;
  }

  /** Right-hand side of a grading row: "90-100 · 20%", or just one, or null. */
  function gradingDetail(row) {
    var parts = [];
    if (isMeaningful(row.range)) parts.push(String(row.range).trim());
    if (isMeaningful(row.weight)) parts.push(String(row.weight).trim());
    return parts.length ? parts.join(" · ") : null;
  }

  /** Stable identity for a key date, so re-importing doesn't duplicate rows. */
  function keyDateId(kd) {
    return String(kd.title || "").trim() + "|" + String(kd.date || "").trim();
  }

  /**
   * script.js declares `let classes`, and a top-level `let` in a classic script
   * does NOT become a property of window — it lives in the global lexical
   * scope. So this reads the bare identifier, which resolves across script
   * tags, rather than window.classes, which is permanently undefined. Losing an
   * afternoon to that once is enough.
   */
  function allClasses() {
    return typeof classes !== "undefined" && Array.isArray(classes) ? classes : [];
  }

  function getClass(i) {
    var list = allClasses();
    return list[i] ? list[i] : null;
  }

  function syllabusOf(cls) {
    return cls && cls.syllabus ? cls.syllabus : null;
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  function policyCard(title, body) {
    if (!isMeaningful(body)) {
      return (
        '<div style="background:var(--bg-tertiary); border-radius:var(--radius-md); padding:12px; margin-bottom:8px;">' +
        '<strong style="display:block; margin-bottom:4px; color:var(--text-primary);">' + esc(title) + "</strong>" +
        // An honest "not stated" beats a blank card. A student who sees this
        // knows to email their professor; a student who sees nothing assumes
        // the app failed.
        '<span style="color:var(--text-secondary); font-style:italic;">Not stated in the syllabus</span>' +
        "</div>"
      );
    }
    return (
      '<div style="background:var(--bg-tertiary); border-radius:var(--radius-md); padding:12px; margin-bottom:8px;">' +
      '<strong style="display:block; margin-bottom:4px; color:var(--text-primary);">' + esc(title) + "</strong>" +
      '<span style="color:var(--text-primary); white-space:pre-wrap;">' + esc(body) + "</span>" +
      "</div>"
    );
  }

  function gradingCard(rows) {
    if (!rows || !rows.length) {
      return policyCard("Grading", null);
    }
    var items = rows
      .map(function (row) {
        var detail = gradingDetail(row);
        return (
          '<div style="display:flex; justify-content:space-between; gap:12px; padding:4px 0; border-bottom:1px solid var(--border);">' +
          '<span style="color:var(--text-primary);">' + esc(row.label) + "</span>" +
          '<span style="color:var(--text-secondary); white-space:nowrap;">' +
          (detail ? esc(detail) : "—") +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<div style="background:var(--bg-tertiary); border-radius:var(--radius-md); padding:12px; margin-bottom:8px;">' +
      '<strong style="display:block; margin-bottom:6px; color:var(--text-primary);">Grading</strong>' +
      items +
      "</div>"
    );
  }

  function contactCard(contact) {
    if (!contact) return "";
    var rows = [
      ["Instructor", contact.instructor_name],
      ["Email", contact.email],
      ["Office", contact.office],
      ["Office hours", contact.office_hours],
    ].filter(function (pair) {
      return isMeaningful(pair[1]);
    });
    if (!rows.length) return "";

    return (
      '<div style="background:var(--bg-tertiary); border-radius:var(--radius-md); padding:12px; margin-bottom:8px;">' +
      '<strong style="display:block; margin-bottom:6px; color:var(--text-primary);">Instructor</strong>' +
      rows
        .map(function (pair) {
          var value =
            pair[0] === "Email"
              ? '<a href="mailto:' + esc(pair[1]) + '" style="color:var(--primary);">' + esc(pair[1]) + "</a>"
              : esc(pair[1]);
          return (
            '<div style="display:flex; gap:12px; padding:3px 0;">' +
            '<span style="color:var(--text-secondary); min-width:90px;">' + esc(pair[0]) + "</span>" +
            '<span style="color:var(--text-primary);">' + value + "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /**
   * The key-date review screen.
   *
   * Deliberately NOT a one-click "import everything". A parse of a real
   * syllabus turns up holidays, reading assignments nobody tracks, and the
   * occasional hallucinated-looking row. Dumping thirty items into a student's
   * assignment list unasked would make the feature something they turn off.
   * Every row is opt-in, and every row shows the date it will actually create.
   */
  function keyDatesSection(classIndex, cls) {
    var syl = syllabusOf(cls);
    var dates = (syl && syl.data && syl.data.key_dates) || [];
    if (!dates.length) {
      return (
        '<div style="color:var(--text-secondary); font-size:0.9em; padding:8px 0;">' +
        "No dated items were found in this syllabus." +
        "</div>"
      );
    }

    var imported = (syl && syl.imported) || {};
    var selection = (syl && syl.selection) || {};

    var rows = dates
      .map(function (kd, idx) {
        var id = keyDateId(kd);
        var alreadyImported = !!imported[id];
        var datable = kd.date && D.isValidDateString(kd.date);
        // A date the model could not resolve to a real day cannot become an
        // assignment — there is nothing to put in the date field. The row still
        // shows, because "Week 4: paper due" is worth reading even when it
        // cannot be scheduled.
        var kind = selection[id] || (kd.type === "exam" ? "test" : "assignment");
        var checked = selection[id] !== undefined || (!alreadyImported && datable && kd.type !== "holiday");

        var badge =
          '<span style="font-size:0.75em; padding:2px 8px; border-radius:999px; background:var(--bg-primary); color:var(--text-secondary); border:1px solid var(--border);">' +
          esc(kd.type) + "</span>";

        return (
          '<div style="display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid var(--border);">' +
          '<input type="checkbox" id="kd-' + classIndex + "-" + idx + '" ' +
          (alreadyImported || !datable ? "disabled" : checked ? "checked" : "") +
          ' style="margin-top:4px; width:18px; height:18px; flex-shrink:0;">' +
          '<div style="flex:1; min-width:0;">' +
          '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
          '<strong style="color:var(--text-primary);">' + esc(kd.title) + "</strong>" + badge +
          "</div>" +
          '<div style="font-size:0.85em; color:var(--text-secondary); margin-top:2px;">' +
          (datable
            ? esc(D.formatCalendarDate(kd.date))
            : '<em>No usable date' + (isMeaningful(kd.notes) ? " — " + esc(kd.notes) : "") + "</em>") +
          (datable && isMeaningful(kd.notes) ? " · " + esc(kd.notes) : "") +
          "</div>" +
          (alreadyImported
            ? '<div style="font-size:0.8em; color:var(--success); margin-top:4px;">✔ Already added</div>'
            : datable
            ? '<div style="margin-top:6px;">' +
              '<select id="kd-kind-' + classIndex + "-" + idx + '" style="padding:4px 8px; font-size:0.85em; border-radius:6px; border:2px solid var(--border); background:var(--bg-primary); color:var(--text-primary);">' +
              '<option value="assignment"' + (kind === "assignment" ? " selected" : "") + ">Add as assignment</option>" +
              '<option value="test"' + (kind === "test" ? " selected" : "") + ">Add as test</option>" +
              "</select></div>"
            : "") +
          "</div></div>"
        );
      })
      .join("");

    var pending = dates.filter(function (kd) {
      return !imported[keyDateId(kd)] && kd.date && D.isValidDateString(kd.date);
    }).length;

    return (
      '<div style="margin-top:4px;">' + rows + "</div>" +
      (pending
        ? '<div style="margin-top:12px;">' +
          '<button onclick="Do2DateSyllabus.importKeyDates(' + classIndex + ')">' +
          "Add selected to " + esc(cls.name) +
          "</button></div>"
        : '<div style="margin-top:12px; color:var(--text-secondary); font-size:0.9em;">Everything datable here has been added.</div>')
    );
  }

  function readyHtml(classIndex, cls) {
    var syl = syllabusOf(cls);
    var data = syl.data || {};
    var tab = syl.tab === "dates" ? "dates" : "policies";

    var tabButton = function (id, label) {
      var active = tab === id;
      return (
        '<button onclick="Do2DateSyllabus.setTab(' + classIndex + ",'" + id + "')\" " +
        'style="padding:8px 14px; font-size:0.9em; border-radius:var(--radius-md); border:none; cursor:pointer; ' +
        (active
          ? "background:var(--primary); color:#fff;"
          : "background:var(--bg-tertiary); color:var(--text-primary);") +
        '">' + esc(label) + "</button>"
      );
    };

    return (
      '<div style="display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap;">' +
      tabButton("policies", "Policies") +
      tabButton("dates", "Key dates") +
      '<button onclick="Do2DateSyllabus.clearSyllabus(' + classIndex + ')" ' +
      'style="margin-left:auto; padding:8px 14px; font-size:0.9em; background:var(--bg-tertiary); color:var(--text-secondary);">Replace</button>' +
      "</div>" +
      (tab === "policies"
        ? policyCard("Late work", data.late_work_policy) +
          policyCard("Attendance", data.attendance_policy) +
          gradingCard(data.grading_scale) +
          contactCard(data.contact_info)
        : keyDatesSection(classIndex, cls)) +
      '<div style="font-size:0.75em; color:var(--text-secondary); margin-top:10px;">' +
      "Read by AI from " + esc(syl.fileName || "pasted text") +
      (syl.parsedAt ? " on " + esc(new Date(syl.parsedAt).toLocaleDateString()) : "") +
      (syl.truncated ? " · document was long and got truncated" : "") +
      // Never let the student forget a machine did this. The policy that
      // matters is the one in the actual syllabus.
      " · <strong>Check anything important against the real syllabus.</strong>" +
      "</div>"
    );
  }

  function uploadHtml(classIndex, cls) {
    var syl = syllabusOf(cls);
    var busy = syl && syl.status === "processing";
    var error = syl && syl.status === "failed" ? syl.error : null;

    return (
      (error
        ? '<div style="background:var(--danger); color:#fff; padding:10px 12px; border-radius:var(--radius-md); margin-bottom:10px; font-size:0.9em;">' +
          esc(error.message || "That didn't work.") +
          "</div>"
        : "") +
      '<div style="color:var(--text-secondary); font-size:0.9em; margin-bottom:10px;">' +
      "Upload the syllabus and Do2Date will pull out the late-work policy, grading breakdown, and every due date it can find." +
      "</div>" +
      (busy
        ? '<div style="padding:14px; text-align:center; color:var(--text-secondary);">Reading the syllabus… this takes a few seconds.</div>'
        : '<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">' +
          '<input type="file" id="syl-file-' + classIndex + '" accept=".pdf,.txt,.md,application/pdf,text/plain" ' +
          'onchange="Do2DateSyllabus.uploadFile(' + classIndex + ')" ' +
          'style="font-size:0.9em; color:var(--text-primary); max-width:100%;">' +
          "</div>" +
          '<div style="margin-top:10px;">' +
          '<details><summary style="cursor:pointer; color:var(--primary); font-size:0.9em;">Or paste the text instead</summary>' +
          '<textarea id="syl-text-' + classIndex + '" rows="6" placeholder="Paste the syllabus text here" ' +
          'style="width:100%; margin-top:8px; padding:10px; border:2px solid var(--border); border-radius:var(--radius-md); background:var(--bg-primary); color:var(--text-primary); font-family:inherit;"></textarea>' +
          '<button onclick="Do2DateSyllabus.parsePasted(' + classIndex + ')" style="margin-top:8px;">Read this text</button>' +
          "</details></div>" +
          '<div style="font-size:0.75em; color:var(--text-secondary); margin-top:10px;">' +
          "PDF or .txt, up to 3 MB. Scanned syllabi have no text in them — paste instead. " +
          "10 syllabus reads per month." +
          "</div>")
    );
  }

  /**
   * The button that sits in the class card's action row, beside
   * "+ Add Assignment" and "+ Add Test".
   *
   * Deliberately a bare <button> with no inline styling, so it inherits the
   * same rule from style.css those two use. Styling it here would mean this
   * button quietly stops matching the day the stylesheet changes.
   *
   * The label switches once a syllabus exists: "+ Add Syllabus" is a lie at
   * that point, and the count is more useful than the verb.
   */
  function buttonHtml(classIndex, cls) {
    var syl = syllabusOf(cls);
    var ready = syl && syl.status === "ready" && syl.data;
    var label = ready
      ? "Syllabus · " + (syl.data.key_dates || []).length + " dates"
      : "+ Add Syllabus";

    // Secondary, like Add Test. Add Assignment is the one filled button in the
    // row — three equally loud buttons means none of them reads as the default.
    return (
      '<button class="btn-secondary" onclick="Do2DateSyllabus.toggle(' + classIndex + ')">' +
      esc(label) +
      "</button>"
    );
  }

  /**
   * The panel the button opens. Rendered directly beneath the action row —
   * the same place the Add Assignment and Add Test forms appear, so opening
   * any of the three behaves identically.
   */
  function panelHtml(classIndex, cls) {
    if (!cls.syllabusOpen) return "";
    var syl = syllabusOf(cls);
    var ready = syl && syl.status === "ready" && syl.data;

    return (
      '<div style="margin-bottom:10px; padding:12px; background:var(--bg-tertiary); border-radius:var(--radius-md);">' +
      (ready ? readyHtml(classIndex, cls) : uploadHtml(classIndex, cls)) +
      "</div>"
    );
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------

  function toggle(classIndex) {
    var cls = getClass(classIndex);
    if (!cls) return;
    cls.syllabusOpen = !cls.syllabusOpen;
    window.render();
  }

  function setTab(classIndex, tab) {
    var cls = getClass(classIndex);
    if (!cls || !cls.syllabus) return;
    cls.syllabus.tab = tab;
    window.render();
  }

  function clearSyllabus(classIndex) {
    var cls = getClass(classIndex);
    if (!cls) return;
    // Keeps `imported` so replacing a syllabus does not offer to re-add the
    // assignments the student already has.
    var imported = (cls.syllabus && cls.syllabus.imported) || {};
    cls.syllabus = { status: "empty", imported: imported };
    window.save();
    window.render();
  }

  function setStatus(classIndex, patch) {
    var cls = getClass(classIndex);
    if (!cls) return;
    cls.syllabus = Object.assign({ imported: {} }, cls.syllabus || {}, patch);
    window.render();
  }

  /**
   * Everything server-bound funnels through here.
   *
   * Sends the Firebase ID token, which the endpoint verifies with the Admin
   * SDK. That is what stops the endpoint being an open proxy to a metered API
   * key — and it is why guest mode cannot use this feature.
   */
  async function runParse(classIndex, payload, label) {
    var cls = getClass(classIndex);
    if (!cls) return;

    // Check both: script.js tracks `currentUser` from the auth listener, and
    // the SDK tracks its own. They can disagree briefly during startup, and a
    // student who is signed in should never be told otherwise because one of
    // the two had not caught up yet.
    var auth = window.firebaseAuth;
    var user =
      (typeof currentUser !== "undefined" && currentUser) ||
      (auth && auth.currentUser) ||
      null;

    if (!user) {
      setStatus(classIndex, {
        status: "failed",
        error: {
          code: "UNAUTHENTICATED",
          message:
            "Sign in first — reading a syllabus runs on the server, so it needs an account. Use the Sign In button at the top of the page. Your classes stay on this device either way.",
        },
      });
      return;
    }

    setStatus(classIndex, { status: "processing", error: null });

    try {
      var token = await user.getIdToken();
      var response = await fetch("/api/syllabus/parse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(payload),
      });

      var result = await response.json().catch(function () {
        return null;
      });

      if (!response.ok || !result || !result.ok) {
        // The fallback text used to be word-for-word identical to the server's
        // own 502 message. That meant "the server explained itself" and "the
        // server died without a body" looked the same on screen, and cost a
        // debugging round trip. If we are guessing, the message says so and
        // carries the status code.
        setStatus(classIndex, {
          status: "failed",
          error: {
            code: (result && result.code) || "HTTP_" + response.status,
            message:
              (result && result.error) ||
              "The server returned an error (HTTP " +
                response.status +
                ") with no explanation — it probably crashed. Check the Vercel runtime logs.",
          },
        });
        return;
      }

      var current = getClass(classIndex);
      if (!current) return; // class deleted mid-parse

      current.syllabus = {
        status: "ready",
        data: result.data,
        parsedAt: result.parsedAt,
        model: result.model,
        truncated: !!result.truncated,
        fileName: label,
        tab: "policies",
        imported: (current.syllabus && current.syllabus.imported) || {},
        selection: {},
      };
      current.syllabusOpen = true;
      window.save();
      window.render();
    } catch (error) {
      setStatus(classIndex, {
        status: "failed",
        error: {
          code: "NETWORK",
          message:
            "Couldn't reach the syllabus reader. Check your connection and try again.",
        },
      });
    }
  }

  function uploadFile(classIndex) {
    var input = document.getElementById("syl-file-" + classIndex);
    if (!input || !input.files || !input.files[0]) return;
    var file = input.files[0];

    // Checked here as well as on the server so a student on a slow connection
    // finds out before uploading, not after.
    if (file.size > 3 * 1024 * 1024) {
      setStatus(classIndex, {
        status: "failed",
        error: {
          code: "FILE_TOO_LARGE",
          message:
            "That file is over 3 MB. Upload a smaller PDF, or paste the text instead.",
        },
      });
      return;
    }

    setStatus(classIndex, { status: "processing", error: null });

    var reader = new FileReader();
    reader.onload = function () {
      var base64 = String(reader.result).split(",")[1] || "";
      runParse(
        classIndex,
        { mode: "upload", fileName: file.name, fileBase64: base64 },
        file.name
      );
    };
    reader.onerror = function () {
      setStatus(classIndex, {
        status: "failed",
        error: { code: "READ_FAILED", message: "Couldn't read that file." },
      });
    };
    reader.readAsDataURL(file);
  }

  function parsePasted(classIndex) {
    var textarea = document.getElementById("syl-text-" + classIndex);
    var text = textarea ? textarea.value : "";
    if (text.trim().length < 200) {
      setStatus(classIndex, {
        status: "failed",
        error: {
          code: "NO_TEXT_FOUND",
          message:
            "That doesn't look like enough text to be a syllabus. Paste more of it.",
        },
      });
      return;
    }
    runParse(classIndex, { mode: "paste", text: text }, "pasted text");
  }

  /**
   * Turn the checked key dates into real assignments and tests.
   *
   * Writes into the same arrays the manual "+ Add Assignment" button writes to,
   * with the same field names — an imported assignment is indistinguishable
   * from a typed one afterwards, and every existing feature (calendar, ICS
   * export, notifications, progress sliders) picks it up for free.
   */
  function importKeyDates(classIndex) {
    var cls = getClass(classIndex);
    var syl = syllabusOf(cls);
    if (!cls || !syl || !syl.data) return;

    var dates = syl.data.key_dates || [];
    var imported = syl.imported || {};
    var added = 0;

    dates.forEach(function (kd, idx) {
      var box = document.getElementById("kd-" + classIndex + "-" + idx);
      if (!box || !box.checked || box.disabled) return;
      if (!kd.date || !D.isValidDateString(kd.date)) return;

      var id = keyDateId(kd);
      if (imported[id]) return;

      var kindSelect = document.getElementById("kd-kind-" + classIndex + "-" + idx);
      var kind = kindSelect ? kindSelect.value : kd.type === "exam" ? "test" : "assignment";
      var name = String(kd.title || "Untitled").trim().slice(0, 30);

      if (kind === "test") {
        cls.tests.push({ name: name, date: kd.date, prepared: 0 });
      } else {
        // 23:59 matches what the manual form defaults to, and it is what
        // dueBucket treats as an all-day item — due today until the day ends.
        cls.assignments.push({ name: name, due: kd.date, time: "23:59", progress: 0 });
      }

      imported[id] = true;
      added++;
    });

    syl.imported = imported;
    syl.lastImportCount = added;
    window.save();
    window.render();
  }

  window.Do2DateSyllabus = {
    buttonHtml: buttonHtml,
    panelHtml: panelHtml,
    toggle: toggle,
    setTab: setTab,
    clearSyllabus: clearSyllabus,
    uploadFile: uploadFile,
    parsePasted: parsePasted,
    importKeyDates: importKeyDates,
    // Exported for tests and for the console.
    _internals: { esc: esc, isMeaningful: isMeaningful, gradingDetail: gradingDetail, keyDateId: keyDateId },
  };
})();
