console.log("Script loaded");

let classes = JSON.parse(localStorage.getItem("classes")) || [];

// Migrate old data: convert 'readiness' to 'prepared' if needed
classes.forEach(cls => {
    // Add default color if missing
    if (!cls.color) {
        const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
        cls.color = colors[Math.floor(Math.random() * colors.length)];
    }

    if (cls.tests) {
        cls.tests.forEach(test => {
            if (test.readiness !== undefined && test.prepared === undefined) {
                test.prepared = test.readiness;
                delete test.readiness;
            }
        });
    }
});

let activeTab = []; // tracks active tab per class (0 = Assignments, 1 = Tests)

// ---------------------------------------------------------------------------
// TIME ZONE
//
// Every "is this overdue?" question in this app now takes an explicit IANA zone
// instead of whatever the browser happens to report. The browser's zone is a
// fine DEFAULT, and a terrible source of truth: it changes when a student flies
// home for break, and every deadline silently shifts with it. Stored per user
// so it follows them across devices, exactly like their classes do.
// ---------------------------------------------------------------------------
let userTimezone =
    localStorage.getItem("timezone") || Do2DateDates.detectTimeZone();

function getTimeZone() {
    // Guard on read, not just on write. A junk value that reached storage some
    // other way (an old build, a hand-edited Firebase record) would otherwise
    // throw inside Intl on every single row and render a blank page.
    return Do2DateDates.isValidTimeZone(userTimezone)
        ? userTimezone
        : Do2DateDates.detectTimeZone();
}

function setTimeZone(zone) {
    if (!Do2DateDates.isValidTimeZone(zone)) return false;
    userTimezone = zone;
    localStorage.setItem("timezone", zone);
    save();
    render();
    if (typeof renderAllItems === "function") renderAllItems();
    if (typeof renderCalendar === "function") renderCalendar();
    return true;
}

// ---------------------------------------------------------------------------
// DISPLAY NAME
//
// The games leaderboard is world-readable — `leaderboards/$gameType` is
// ".read": true, so anyone can fetch it over plain REST without an account.
// It used to publish `currentUser.email.split('@')[0]`, which for a university
// address is a real identifier next to a guessable domain. Students signed up
// to sync their homework; nobody agreed to have a working email address
// reconstructable from a Snake high score.
//
// So: a name the student chooses, defaulting to something anonymous, stored
// under their own subtree where the existing rules already protect it.
// ---------------------------------------------------------------------------
let displayName = localStorage.getItem("displayName") || "";

function defaultDisplayName() {
    return "Student" + Math.floor(1000 + Math.random() * 9000);
}

/** Trim, cap at 20 chars to match the .validate rule, reject empty. */
function normalizeDisplayName(value) {
    const trimmed = String(value || "").trim().slice(0, 20);
    return trimmed.length > 0 ? trimmed : null;
}

async function loadDisplayNameFromFirebase(userId) {
    try {
        const nameRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/displayName`);
        const snapshot = await window.firebaseGet(nameRef);
        if (snapshot.exists()) {
            const stored = normalizeDisplayName(snapshot.val());
            if (stored) {
                displayName = stored;
                localStorage.setItem("displayName", stored);
            }
        }
    } catch (error) {
        console.error('❌ Error loading display name:', error);
    }
}

function saveDisplayName(name) {
    const clean = normalizeDisplayName(name);
    if (!clean) return null;
    displayName = clean;
    localStorage.setItem("displayName", clean);
    if (currentUser && !isGuestMode) {
        try {
            const nameRef = window.firebaseRef(window.firebaseDatabase, `users/${currentUser.uid}/displayName`);
            window.firebaseSet(nameRef, clean);
        } catch (error) {
            console.error('❌ Error saving display name:', error);
        }
    }
    return clean;
}

/**
 * Resolves to the name to publish, or null if the student backed out.
 *
 * Asked once, at the moment it first matters — the first score submission —
 * rather than bolted onto sign-up, where it would be one more field between a
 * student and the thing they came for. The pre-filled default is anonymous, so
 * hitting Save without reading is the safe outcome rather than the leaky one.
 */
function ensureDisplayName() {
    if (displayName) return Promise.resolve(displayName);

    return new Promise((resolve) => {
        const suggestion = defaultDisplayName();
        const modalHTML = `
            <div id="displayNameModal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.8); z-index:3000; display:flex; align-items:center; justify-content:center; padding:20px;">
                <div style="background:var(--bg-primary); padding:32px; border-radius:16px; max-width:400px; width:100%; box-shadow:var(--shadow-lg);">
                    <h2 style="margin:0 0 8px 0; color:var(--text-primary); text-align:center;">Pick a leaderboard name</h2>
                    <p style="text-align:center; color:var(--text-secondary); margin:0 0 20px 0; font-size:0.9em;">
                        This is public — anyone can see the leaderboard. Your email is never shown.
                    </p>
                    <input id="displayNameInput" maxlength="20" value="${suggestion}"
                           style="width:100%; padding:12px; margin-bottom:16px; border:2px solid var(--border); border-radius:8px; background:var(--bg-secondary); color:var(--text-primary); min-height:44px;">
                    <button id="displayNameSave" style="width:100%; padding:12px; background:var(--primary); color:white; border:none; border-radius:8px; cursor:pointer; font-weight:600; margin-bottom:8px; min-height:44px;">Save and submit score</button>
                    <button id="displayNameCancel" style="width:100%; padding:12px; background:var(--bg-tertiary); color:var(--text-primary); border:none; border-radius:8px; cursor:pointer; min-height:44px;">Don't post my score</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);

        const close = (value) => {
            const modal = document.getElementById('displayNameModal');
            if (modal) modal.remove();
            resolve(value);
        };

        const input = document.getElementById('displayNameInput');
        input.focus();
        input.select();

        document.getElementById('displayNameSave').addEventListener('click', () => {
            // Falling back to the suggestion rather than nagging: an empty box
            // should not trap someone in a dialog they did not ask for.
            close(saveDisplayName(input.value) || saveDisplayName(suggestion));
        });
        document.getElementById('displayNameCancel').addEventListener('click', () => close(null));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('displayNameSave').click();
            if (e.key === 'Escape') close(null);
        });
    });
}

/**
 * HTML-escape. Anything that reaches innerHTML and did not come from this
 * codebase goes through here — leaderboard names above all, since those are
 * written by other users and rendered in everyone else's browser.
 */
function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ELEMENTS
const addClassBtn = document.getElementById("addClassBtn");
const classInput = document.getElementById("classInput");
const classesContainer = document.getElementById("classesContainer");

// SAVE
function save() {
    localStorage.setItem("classes", JSON.stringify(classes));
}

// HELPER: due-in text
//
// Same wording students already see. The difference is that the comparison now
// happens against getTimeZone() rather than the browser's implicit zone, and
// that an item with a real time on it goes "Past due" once that time passes
// instead of holding at "Due today" until midnight. See dates.js.
function dueInText(item) {
    return Do2DateDates.dueInText(item, getTimeZone());
}

// HELPER: urgency bucket, for the colour + label pairing below.
function dueBucketOf(item) {
    return Do2DateDates.dueBucket(item, getTimeZone());
}

// HELPER: format MM/DD
function formatDate(dueDateStr) {
    return Do2DateDates.formatDateShort(dueDateStr);
}

// HELPER: format time (24hr to 12hr)
function formatTime(timeStr) {
    return Do2DateDates.formatTime(timeStr);
}

// ADD CLASS
addClassBtn.addEventListener("click", ()=> {
    let name = classInput.value.trim().slice(0,25);
    if (!name) return;

    // Generate a random color for the class
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    classes.push({ name, assignments: [], tests: [], isOpen: false, color: randomColor });
    classInput.value = "";
    render();
    save();
});

// REMOVE CLASS
function removeClass(classIndex) {
    classes.splice(classIndex, 1);
    render();
    save();
}

// TOGGLE RECURRING OPTIONS
function toggleRecurringOptions(classIndex, type) {
    const prefix = type === 'assignment' ? 'a' : 't';
    const checkbox = document.getElementById(`${prefix}-recurring-${classIndex}`);
    const frequency = document.getElementById(`${prefix}-frequency-${classIndex}`);
    const occurrences = document.getElementById(`${prefix}-occurrences-${classIndex}`);
    const label = document.getElementById(`${prefix}-recurring-label-${classIndex}`);

    if (checkbox.checked) {
        frequency.style.display = 'inline-block';
        occurrences.style.display = 'inline-block';
        label.style.display = 'inline';
        updateRecurringLabel(classIndex, type);
    } else {
        frequency.style.display = 'none';
        occurrences.style.display = 'none';
        label.style.display = 'none';
    }
}

function updateRecurringLabel(classIndex, type) {
    const prefix = type === 'assignment' ? 'a' : 't';
    const frequency = document.getElementById(`${prefix}-frequency-${classIndex}`).value;
    const occurrences = document.getElementById(`${prefix}-occurrences-${classIndex}`).value;
    const label = document.getElementById(`${prefix}-recurring-label-${classIndex}`);

    const freqText = frequency === 'weekly' ? 'week' : '2 weeks';
    label.textContent = `(creates ${occurrences} ${type}s, every ${freqText})`;
}

// ADD ASSIGNMENT
function addAssignment(classIndex){
    const nameInput = document.getElementById(`a-name-${classIndex}`);
    const dueInput = document.getElementById(`a-due-${classIndex}`);
    const timeInput = document.getElementById(`a-time-${classIndex}`);
    const recurringCheckbox = document.getElementById(`a-recurring-${classIndex}`);
    const frequencySelect = document.getElementById(`a-frequency-${classIndex}`);
    const occurrencesInput = document.getElementById(`a-occurrences-${classIndex}`);

    if(!nameInput.value || !dueInput.value) return;

    const assignmentName = nameInput.value.trim().slice(0,30);
    const dueTime = timeInput.value || '23:59';
    const isRecurring = recurringCheckbox.checked;

    if (isRecurring) {
        // Create multiple recurring assignments
        const frequency = frequencySelect.value;
        const occurrences = parseInt(occurrencesInput.value);
        const interval = frequency === 'weekly' ? 7 : 14; // days

        // THE BUG THIS REPLACES: the old code did
        //   new Date("2026-03-05")     -> UTC midnight
        //   .setDate(getDate() + 7)    -> LOCAL time arithmetic
        //   .toISOString().slice(0,10) -> read back as UTC
        // Parse in one calendar, add in another, read back in the first. Those
        // cancel out until a DST boundary lands inside the series, and then
        // every occurrence after it is a day early — permanently. A weekly
        // assignment starting 2026-03-05 produced Mar 11, 18, 25 instead of
        // Mar 12, 19, 26. addCalendarDays does the arithmetic in UTC, where
        // every day is 24 hours. Covered by dates.test.js.
        for (let i = 0; i < occurrences; i++) {
            const dateStr = Do2DateDates.addCalendarDays(dueInput.value, i * interval);
            if (!dateStr) continue; // malformed input; refuse rather than store junk
            const assignmentNumber = occurrences > 1 ? ` #${i + 1}` : '';

            classes[classIndex].assignments.push({
                name: assignmentName + assignmentNumber,
                due: dateStr,
                time: dueTime,
                progress: 0
            });
        }
    } else {
        // Create single assignment
        classes[classIndex].assignments.push({
            name: assignmentName,
            due: dueInput.value,
            time: dueTime,
            progress: 0
        });
    }

    nameInput.value = '';
    dueInput.value = '';
    timeInput.value = '23:59';
    recurringCheckbox.checked = false;
    toggleRecurringOptions(classIndex, 'assignment');

    // Hide the form after adding
    document.getElementById(`add-assignment-form-${classIndex}`).style.display = 'none';

    render(); save();
}

// TOGGLE ADD ASSIGNMENT FORM
function toggleAddAssignment(classIndex) {
    const form = document.getElementById(`add-assignment-form-${classIndex}`);
    const testForm = document.getElementById(`add-test-form-${classIndex}`);

    // Hide test form if open
    testForm.style.display = 'none';

    // Toggle assignment form
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// CANCEL ADD ASSIGNMENT
function cancelAddAssignment(classIndex) {
    const form = document.getElementById(`add-assignment-form-${classIndex}`);
    const nameInput = document.getElementById(`a-name-${classIndex}`);
    const dueInput = document.getElementById(`a-due-${classIndex}`);
    const timeInput = document.getElementById(`a-time-${classIndex}`);

    // Clear inputs
    nameInput.value = '';
    dueInput.value = '';
    timeInput.value = '23:59';

    // Hide form
    form.style.display = 'none';
}

// UPDATE ASSIGNMENT PROGRESS
function updateAssignmentProgress(classIndex, assignmentIndex, value){
    const oldProgress = classes[classIndex].assignments[assignmentIndex].progress;
    classes[classIndex].assignments[assignmentIndex].progress = Number(value);

    // Update the display value immediately
    if (event && event.target) {
        const slider = event.target;
        const parentDiv = slider.parentElement;

        // Try to find a span first (All Items view)
        const spans = parentDiv.querySelectorAll('span');
        const lastSpan = spans[spans.length - 1];

        if (lastSpan && lastSpan.textContent.includes('/10')) {
            // All Items view - update the span
            lastSpan.textContent = `${value}/10`;
        } else {
            // My Classes view - update the text node
            const textNodes = Array.from(parentDiv.childNodes);
            for (let i = 0; i < textNodes.length; i++) {
                if (textNodes[i] === slider && i < textNodes.length - 1) {
                    const nextNode = textNodes[i + 1];
                    if (nextNode.nodeType === Node.TEXT_NODE) {
                        nextNode.textContent = ` ${value}/10`;
                        break;
                    }
                }
            }
        }
    }

    // Check if completion status changed (crossed the 10 threshold)
    const wasCompleted = oldProgress === 10;
    const isCompleted = Number(value) === 10;

    // Only re-render if completion status changed
    if (wasCompleted !== isCompleted) {
        render();
        // Also update All Items if it's currently visible
        const allItemsView = document.getElementById('allItemsView');
        if (allItemsView && allItemsView.style.display !== 'none') {
            renderAllItems();
        }
    }

    save();
}

// REMOVE ASSIGNMENT
function removeAssignment(classIndex, assignmentIndex){
    classes[classIndex].assignments.splice(assignmentIndex,1);
    render(); save();
}

// ADD TEST
function addTest(classIndex){
    const nameInput = document.getElementById(`t-name-${classIndex}`);
    const dateInput = document.getElementById(`t-date-${classIndex}`);
    if(!nameInput.value || !dateInput.value) return;
    const testName = nameInput.value.trim().slice(0,30);
    classes[classIndex].tests.push({ name:testName, date:dateInput.value, prepared:0 });
    nameInput.value = '';
    dateInput.value = '';

    // Hide the form after adding
    document.getElementById(`add-test-form-${classIndex}`).style.display = 'none';

    render(); save();
}

// TOGGLE ADD TEST FORM
function toggleAddTest(classIndex) {
    const form = document.getElementById(`add-test-form-${classIndex}`);
    const assignmentForm = document.getElementById(`add-assignment-form-${classIndex}`);

    // Hide assignment form if open
    assignmentForm.style.display = 'none';

    // Toggle test form
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

// CANCEL ADD TEST
function cancelAddTest(classIndex) {
    const form = document.getElementById(`add-test-form-${classIndex}`);
    const nameInput = document.getElementById(`t-name-${classIndex}`);
    const dateInput = document.getElementById(`t-date-${classIndex}`);

    // Clear inputs
    nameInput.value = '';
    dateInput.value = '';

    // Hide form
    form.style.display = 'none';
}

// UPDATE TEST PREPARED
function updateTestPrepared(classIndex, testIndex, value){
    const oldPrepared = classes[classIndex].tests[testIndex].prepared;
    classes[classIndex].tests[testIndex].prepared = Number(value);

    // Update the display value immediately
    if (event && event.target) {
        const slider = event.target;
        const parentDiv = slider.parentElement;

        // Try to find a span first (All Items view)
        const spans = parentDiv.querySelectorAll('span');
        const lastSpan = spans[spans.length - 1];

        if (lastSpan && lastSpan.textContent.includes('/10')) {
            // All Items view - update the span
            lastSpan.textContent = `${value}/10`;
        } else {
            // My Classes view - update the text node
            const textNodes = Array.from(parentDiv.childNodes);
            for (let i = 0; i < textNodes.length; i++) {
                if (textNodes[i] === slider && i < textNodes.length - 1) {
                    const nextNode = textNodes[i + 1];
                    if (nextNode.nodeType === Node.TEXT_NODE) {
                        nextNode.textContent = ` ${value}/10`;
                        break;
                    }
                }
            }
        }
    }

    // Check if completion status changed (crossed the 10 threshold)
    const wasCompleted = oldPrepared === 10;
    const isCompleted = Number(value) === 10;

    // Only re-render if completion status changed
    if (wasCompleted !== isCompleted) {
        render();
        // Also update All Items if it's currently visible
        const allItemsView = document.getElementById('allItemsView');
        if (allItemsView && allItemsView.style.display !== 'none') {
            renderAllItems();
        }
    }

    save();
}

// REMOVE TEST
function removeTest(classIndex,testIndex){
    classes[classIndex].tests.splice(testIndex,1);
    render(); save();
}

// TOGGLE CLASS
function toggleClass(classIndex) {
    classes[classIndex].isOpen = !classes[classIndex].isOpen;
    render();
}

// RENDER
function render() {
    classesContainer.innerHTML = "";
    classes = classes.map(cls => ({
        ...cls,
        assignments: cls.assignments || [],
        tests: cls.tests || [],
        color: cls.color || '#6366f1',
        isOpen: cls.isOpen !== undefined ? cls.isOpen : false
    }));
    classes.forEach((cls, classIndex) => {
        const classDiv = document.createElement("div");
        classDiv.className = "class-card";

        const uncompletedCount = cls.assignments.filter(a => a.progress < 10).length;
        const displayClassName = cls.name.length > 25 ? cls.name.slice(0,25) + "…" : cls.name;

        // Sort assignments: unfinished first, then by due date.
        //
        // Finished work sinking to the bottom is the whole point — with a
        // syllabus imported, a class can carry thirty items, and the ones that
        // still need doing are the only ones worth putting at eye level.
        //
        // Sorting by the date STRING rather than new Date(): "YYYY-MM-DD"
        // compares correctly as text, and an item with a missing or malformed
        // date sorts to the end instead of becoming NaN and scrambling the
        // order around it.
        const byDoneThenDate = (doneOf, dateOf) => (a, b) => {
            const doneDiff = (doneOf(a) ? 1 : 0) - (doneOf(b) ? 1 : 0);
            if (doneDiff !== 0) return doneDiff;
            return String(dateOf(a) || '9999').localeCompare(String(dateOf(b) || '9999'));
        };

        const sortedAssignments = [...cls.assignments]
            .map((a, idx) => ({...a, originalIndex: idx}))
            .sort(byDoneThenDate(a => a.progress === 10, a => a.due));

        const sortedTests = [...cls.tests]
            .map((t, idx) => ({...t, originalIndex: idx}))
            .sort(byDoneThenDate(t => t.prepared === 10, t => t.date));

        classDiv.innerHTML = `
        <div class="class-header" onclick="toggleClass(${classIndex})" style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center;">
                <span id="toggle-icon-${classIndex}" style="margin-right:8px;">${cls.isOpen ? '▼' : '▶'}</span>
                <div style="width:8px; height:8px; border-radius:50%; background:${cls.color}; margin-right:10px;"></div>
                <h2 title="${cls.name}" style="margin:0;">${displayClassName}</h2>
                <button onclick="event.stopPropagation(); changeClassColor(${classIndex})" class="icon-btn icon-btn--inline" title="Change colour" aria-label="Change class colour"><svg viewBox="0 0 24 24"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg></button>
            </div>
            <span class="assignment-count">${uncompletedCount} assignments</span>
        </div>

        <div id="items-container-${classIndex}" style="display:${cls.isOpen ? 'block' : 'none'}; margin-top:10px;">
            <!-- Add buttons -->
            <div style="margin-bottom:10px; display:flex; gap:8px;">
                <button onclick="toggleAddAssignment(${classIndex})" id="show-add-assignment-${classIndex}">+ Add Assignment</button>
                <button onclick="toggleAddTest(${classIndex})" id="show-add-test-${classIndex}" class="btn-secondary">+ Add Test</button>
                ${Do2DateSyllabus.buttonHtml(classIndex, cls)}
            </div>

            <!-- Syllabus panel, in the same position the two forms above use -->
            ${Do2DateSyllabus.panelHtml(classIndex, cls)}
            
            <!-- Add Assignment Form (hidden by default) -->
            <div id="add-assignment-form-${classIndex}" style="display:none; margin-bottom:10px; padding:10px; background:var(--bg-tertiary); border-radius:8px;">
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                    <input id="a-name-${classIndex}" placeholder="Assignment name" style="flex: 1; min-width: 150px;">
                    <input id="a-due-${classIndex}" type="date" style="width: 140px;">
                    <input id="a-time-${classIndex}" type="time" value="23:59" style="width: 100px;">
                </div>
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:6px; color:var(--text-primary); font-size:0.9em;">
                        <input type="checkbox" id="a-recurring-${classIndex}" onchange="toggleRecurringOptions(${classIndex}, 'assignment')">
                        <svg viewBox="0 0 24 24" style="width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none;"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                        Recurring
                    </label>
                    <select id="a-frequency-${classIndex}" style="display:none; padding:6px; border-radius:6px; border:2px solid var(--border); background:var(--bg-primary); color:var(--text-primary);" onchange="updateRecurringLabel(${classIndex}, 'assignment')">
                        <option value="weekly">Weekly</option>
                        <option value="biweekly">Every 2 weeks</option>
                    </select>
                    <input type="number" id="a-occurrences-${classIndex}" min="2" max="20" value="4" placeholder="Times" style="display:none; width:80px; padding:6px; border-radius:6px; border:2px solid var(--border); background:var(--bg-primary); color:var(--text-primary);" title="Number of times to repeat" oninput="updateRecurringLabel(${classIndex}, 'assignment')">
                    <span id="a-recurring-label-${classIndex}" style="display:none; font-size:0.85em; color:var(--text-secondary);"></span>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="addAssignment(${classIndex})">Save Assignment</button>
                    <button onclick="cancelAddAssignment(${classIndex})" style="background:var(--bg-secondary); color:var(--text-primary);">Cancel</button>
                </div>
            </div>
                
            <!-- Add Test Form (hidden by default) -->
            <div id="add-test-form-${classIndex}" style="display:none; margin-bottom:var(--space-3); padding:var(--space-3); background:var(--bg-tertiary); border-radius:var(--radius-md);">
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                    <input id="t-name-${classIndex}" placeholder="Test name" style="flex: 1; min-width: 150px;">
                    <input id="t-date-${classIndex}" type="date" style="width: 140px;">
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="addTest(${classIndex})">Save Test</button>
                    <button onclick="cancelAddTest(${classIndex})" class="btn-secondary">Cancel</button>
                </div>
            </div>

            <!-- ASSIGNMENTS SECTION -->
            ${sortedAssignments.length > 0 ? '<h3 style="margin-top:15px; margin-bottom:8px; font-size:1.1em;">Assignments</h3>' : ''}
            ${sortedAssignments.map((a) => {
            const completed = a.progress === 10;
            const displayAssignmentName = a.name.length > 30 ? a.name.slice(0,30) + "…" : a.name;
            const timeDisplay = a.time ? formatTime(a.time) : '';
            // A finished item said "Done" in a badge AND "Due today" in the
            // chip — two claims about the same thing, one of them irrelevant
            // once the work is finished. The chip is the single answer now, so
            // the badge below is gone. That also buys back a row of height on
            // every completed item, which adds up in a thirty-item class.
            const aBucket = dueBucketOf(a);
            const aChip = completed ? 'Done' : dueInText(a);
            return `
            <div class="assignment ${completed ? 'completed' : ''}">
                <div style="display:flex; justify-content: space-between; align-items:center;">
                    <div>
                        <strong title="${a.name}">${displayAssignmentName}</strong>
                        <span style="font-size:0.85em; color:var(--text-secondary); margin-left:8px;">
                            ${formatDate(a.due)}${timeDisplay ? ' at ' + timeDisplay : ''}
                        </span>
                        <span class="due-chip" style="margin-left:6px; color:${Do2DateDates.BUCKET_COLORS[aBucket]};">${aChip}</span>
                    </div>
                </div>
                <div>
                    Progress:
                    <input type="range" min="0" max="10" value="${a.progress}" 
                           oninput="updateAssignmentProgress(${classIndex},${a.originalIndex},this.value)">
                    ${a.progress}/10
                </div>
                <div style="margin-top:6px; display:flex; gap:8px;">
                    <button onclick="editItem(${classIndex}, ${a.originalIndex}, 'assignment')" class="btn-secondary">Edit</button>
                    <button onclick="removeAssignment(${classIndex},${a.originalIndex})">Remove</button>
                </div>
            </div>
        `;
        }).join('')}

            <!-- TESTS SECTION -->
            ${sortedTests.length > 0 ? '<h3 style="margin-top:15px; margin-bottom:8px; font-size:1.1em;">Tests</h3>' : ''}
            ${sortedTests.map((t) => {
            const ready = t.prepared === 10;
            const displayTestName = t.name.length > 30 ? t.name.slice(0,30) + "…" : t.name;
            const tBucket = dueBucketOf(t);
            const tChip = ready ? 'Ready' : dueInText(t);
            return `
            <div class="test ${ready ? 'completed' : ''}">
                <div style="display:flex; justify-content: space-between; align-items:center;">
                    <div>
                        <strong title="${t.name}">${displayTestName}</strong>
                        <span style="font-size:0.85em; color:var(--text-secondary); margin-left:8px;">
                            ${formatDate(t.date)}
                        </span>
                        <span class="due-chip" style="margin-left:6px; color:${Do2DateDates.BUCKET_COLORS[tBucket]};">${tChip}</span>
                    </div>
                </div>
                <div>
                    Prepared:
                    <input type="range" min="0" max="10" value="${t.prepared}" 
                           oninput="updateTestPrepared(${classIndex},${t.originalIndex},this.value)">
                    ${t.prepared}/10
                </div>
                <div style="margin-top:6px; display:flex; gap:8px;">
                    <button onclick="editItem(${classIndex}, ${t.originalIndex}, 'test')" class="btn-secondary">Edit</button>
                    <button onclick="removeTest(${classIndex},${t.originalIndex})">Remove</button>
                </div>
            </div>
        `;
        }).join('')}

            <div style="margin-top:15px; text-align:right;">
                <button onclick="removeClass(${classIndex})" class="btn-danger" style="padding:6px 14px; font-size:0.82rem;">
                    Remove Class
                </button>
            </div>
        </div>
        `;

        classesContainer.appendChild(classDiv);
    });
}

// INIT
render();

// VIEW SWITCHING
function switchView(view) {
    const classesView = document.getElementById('classesView');
    const allItemsView = document.getElementById('allItemsView');
    const calendarView = document.getElementById('calendarView');
    const classesTab = document.getElementById('classesTab');
    const allItemsTab = document.getElementById('allItemsTab');
    const calendarTab = document.getElementById('calendarTab');

    // Hide all views and deactivate all tabs
    classesView.style.display = 'none';
    allItemsView.style.display = 'none';
    calendarView.style.display = 'none';
    classesTab.classList.remove('active');
    allItemsTab.classList.remove('active');
    calendarTab.classList.remove('active');

    // Show selected view and activate tab
    if (view === 'classes') {
        classesView.style.display = 'block';
        classesTab.classList.add('active');
    } else if (view === 'allItems') {
        allItemsView.style.display = 'block';
        allItemsTab.classList.add('active');
        renderAllItems();
    } else if (view === 'calendar') {
        calendarView.style.display = 'block';
        calendarTab.classList.add('active');
        renderCalendar();
    }
}

// RENDER ALL ITEMS VIEW
function renderAllItems() {
    const container = document.getElementById('allItemsContainer');

    // Get current filter (default to 'all')
    if (!window.allItemsFilter) window.allItemsFilter = 'all';

    // Collect all assignments and tests with their class info
    let allItems = [];

    classes.forEach((cls, classIndex) => {
        cls.assignments.forEach((assignment, assignmentIndex) => {
            allItems.push({
                type: 'assignment',
                name: assignment.name,
                date: assignment.due,
                time: assignment.time,
                progress: assignment.progress,
                className: cls.name,
                classColor: cls.color,
                classIndex: classIndex,
                itemIndex: assignmentIndex
            });
        });

        cls.tests.forEach((test, testIndex) => {
            allItems.push({
                type: 'test',
                name: test.name,
                date: test.date,
                prepared: test.prepared,
                className: cls.name,
                classColor: cls.color,
                classIndex: classIndex,
                itemIndex: testIndex
            });
        });
    });

    // Filter based on current filter
    if (window.allItemsFilter === 'assignments') {
        allItems = allItems.filter(item => item.type === 'assignment');
    } else if (window.allItemsFilter === 'tests') {
        allItems = allItems.filter(item => item.type === 'test');
    }

    // Same rule as the class cards: finished work last, then by date.
    // Keeping the two views consistent matters more than it sounds — an item
    // that is third from the top in one place and buried in the other reads as
    // a bug, even when both orders are individually defensible.
    allItems.sort((a, b) => {
        const doneA = a.type === 'assignment' ? a.progress === 10 : a.prepared === 10;
        const doneB = b.type === 'assignment' ? b.progress === 10 : b.prepared === 10;
        if (doneA !== doneB) return doneA ? 1 : -1;
        return String(a.date || '9999').localeCompare(String(b.date || '9999'));
    });

    if (allItems.length === 0) {
        const filterText = window.allItemsFilter === 'all' ? 'No assignments or tests yet. Add some in the "My Classes" tab!' :
            window.allItemsFilter === 'assignments' ? 'No assignments yet. Add some in the "My Classes" tab!' :
                'No tests yet. Add some in the "My Classes" tab!';
        container.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">
                <div class="filter-tabs">
                    <button class="filter-tab ${window.allItemsFilter === 'all' ? 'active' : ''}" onclick="setAllItemsFilter('all')">All</button>
                    <button class="filter-tab ${window.allItemsFilter === 'assignments' ? 'active' : ''}" onclick="setAllItemsFilter('assignments')">Assignments</button>
                    <button class="filter-tab ${window.allItemsFilter === 'tests' ? 'active' : ''}" onclick="setAllItemsFilter('tests')">Tests</button>
                </div>
                <p style="text-align:center; color:var(--text-secondary); padding:var(--space-6);">${filterText}</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div style="max-width: 800px; margin: 0 auto;">
            <h2 style="margin-bottom: 20px;">All Assignments & Tests</h2>
            
            <div class="filter-tabs">
                <button class="filter-tab ${window.allItemsFilter === 'all' ? 'active' : ''}" onclick="setAllItemsFilter('all')">All</button>
                <button class="filter-tab ${window.allItemsFilter === 'assignments' ? 'active' : ''}" onclick="setAllItemsFilter('assignments')">Assignments</button>
                <button class="filter-tab ${window.allItemsFilter === 'tests' ? 'active' : ''}" onclick="setAllItemsFilter('tests')">Tests</button>
            </div>
            
            ${allItems.map(item => {
        const isAssignment = item.type === 'assignment';
        const completed = isAssignment ? item.progress === 10 : item.prepared === 10;
        const displayName = item.name.length > 40 ? item.name.slice(0,40) + "…" : item.name;
        const itemBucket = dueBucketOf(item);
        const itemChip = completed ? (isAssignment ? 'Done' : 'Ready') : dueInText(item);

        return `
                <div class="${item.type} ${completed ? 'completed' : ''}" style="margin-bottom: 10px;">
                    <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px;">
                        <div style="flex: 1;">
                            <div style="display:flex; align-items:center; gap: 8px; flex-wrap: wrap;">
                                <strong title="${item.name}">${displayName}</strong>
                                <span style="background: var(--bg-tertiary); padding: 2px 8px; border-radius: 12px; font-size: 0.8em; color: var(--text-secondary); display:flex; align-items:center; gap:6px;">
                                    <div style="width:6px; height:6px; border-radius:50%; background:${item.classColor};"></div>
                                    ${item.className}
                                </span>
                            </div>
                            <span style="font-size:0.85em; color:var(--text-secondary); margin-top: 4px; display: block;">
                                ${formatDate(item.date)}${isAssignment && item.time ? ' at ' + formatTime(item.time) : ''}
                                <span class="due-chip" style="margin-left:6px; color:${Do2DateDates.BUCKET_COLORS[itemBucket]};">${itemChip}</span>
                            </span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <span style="min-width: 80px;">${isAssignment ? 'Progress:' : 'Prepared:'}</span>
                        <input type="range" min="0" max="10" value="${isAssignment ? item.progress : item.prepared}" 
                               oninput="${isAssignment ? 'updateAssignmentProgress' : 'updateTestPrepared'}(${item.classIndex},${item.itemIndex},this.value);"
                               style="flex: 1;">
                        <span style="min-width: 40px;">${isAssignment ? item.progress : item.prepared}/10</span>
                    </div>
                    <div style="margin-top:8px; display:flex; gap:8px;">
                        <button onclick="editItem(${item.classIndex}, ${item.itemIndex}, '${item.type}')" class="btn-secondary" style="font-size:0.85em; padding:6px 12px;">Edit</button>
                        <button onclick="${isAssignment ? 'removeAssignment' : 'removeTest'}(${item.classIndex},${item.itemIndex}); renderAllItems();" class="btn-danger" style="font-size:0.85em; padding:6px 12px;">Remove</button>
                    </div>
                </div>
                `;
    }).join('')}
        </div>
    `;
}

// SET FILTER FOR ALL ITEMS VIEW
function setAllItemsFilter(filter) {
    window.allItemsFilter = filter;
    renderAllItems();
}

// CALENDAR VIEW
if (!window.currentCalendarDate) {
    window.currentCalendarDate = new Date();
}

function renderCalendar() {
    const container = document.getElementById('calendarContainer');
    const date = window.currentCalendarDate;
    const year = date.getFullYear();
    const month = date.getMonth();

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];

    // Collect all items for this month
    let itemsByDate = {};
    classes.forEach((cls, classIndex) => {
        cls.assignments.forEach((assignment, assignmentIndex) => {
            const dateKey = assignment.due;
            if (!itemsByDate[dateKey]) itemsByDate[dateKey] = [];
            itemsByDate[dateKey].push({
                type: 'assignment',
                name: assignment.name,
                className: cls.name,
                classColor: cls.color,
                progress: assignment.progress,
                classIndex: classIndex,
                itemIndex: assignmentIndex
            });
        });

        cls.tests.forEach((test, testIndex) => {
            const dateKey = test.date;
            if (!itemsByDate[dateKey]) itemsByDate[dateKey] = [];
            itemsByDate[dateKey].push({
                type: 'test',
                name: test.name,
                className: cls.name,
                classColor: cls.color,
                prepared: test.prepared,
                classIndex: classIndex,
                itemIndex: testIndex
            });
        });
    });

    // Build calendar HTML
    let calendarHTML = `
        <div style="max-width: 1000px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <button onclick="changeMonth(-1)" style="padding: 8px 16px; cursor: pointer;">◀ Previous</button>
                <h2>${monthNames[month]} ${year}</h2>
                <button onclick="changeMonth(1)" style="padding: 8px 16px; cursor: pointer;">Next ▶</button>
            </div>
            
            <div class="calendar-grid">
                <div class="calendar-day-header">Sun</div>
                <div class="calendar-day-header">Mon</div>
                <div class="calendar-day-header">Tue</div>
                <div class="calendar-day-header">Wed</div>
                <div class="calendar-day-header">Thu</div>
                <div class="calendar-day-header">Fri</div>
                <div class="calendar-day-header">Sat</div>
    `;

    // Add empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
        calendarHTML += '<div class="calendar-day empty"></div>';
    }

    // Add days of the month
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const items = itemsByDate[dateKey] || [];
        const cellDate = new Date(year, month, day);
        const isToday = cellDate.getTime() === today.getTime();

        calendarHTML += `
            <div class="calendar-day ${isToday ? 'today' : ''}">
                <div class="day-number">${day}</div>
                <div class="day-items">
        `;

        // Add items for this day
        items.forEach(item => {
            const isAssignment = item.type === 'assignment';
            const completed = isAssignment ? item.progress === 10 : item.prepared === 10;
            const displayName = item.name.length > 15 ? item.name.slice(0, 15) + '…' : item.name;

            calendarHTML += `
                <div class="calendar-item ${completed ? 'completed' : ''}" 
                     style="background: ${completed ? 'var(--bg-tertiary)' : item.classColor}; color: ${completed ? 'var(--text-secondary)' : 'white'};"
                     title="${item.name} - ${item.className}">
                    <span class="item-name">${displayName}</span>
                </div>
            `;
        });

        calendarHTML += `
                </div>
            </div>
        `;
    }

    calendarHTML += `
            </div>
            
            <div class="calendar-legend">
                <div style="display: flex; gap: 20px; justify-content: center; align-items: center; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="color: var(--text-primary); font-weight: 500;">Items are colored by class</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: var(--text-secondary); border-radius: 3px;"></div>
                        <span style="color: var(--text-primary);">Completed</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = calendarHTML;
}

function changeMonth(delta) {
    const date = window.currentCalendarDate;
    date.setMonth(date.getMonth() + delta);
    renderCalendar();
}

// CHANGE CLASS COLOR
function changeClassColor(classIndex) {
    const colors = [
        { name: 'Indigo', value: '#6366f1' },
        { name: 'Purple', value: '#8b5cf6' },
        { name: 'Pink', value: '#ec4899' },
        { name: 'Red', value: '#f43f5e' },
        { name: 'Orange', value: '#f59e0b' },
        { name: 'Green', value: '#10b981' },
        { name: 'Cyan', value: '#06b6d4' },
        { name: 'Blue', value: '#3b82f6' }
    ];

    const colorOptions = colors.map(c => `
        <div onclick="setClassColor(${classIndex}, '${c.value}')" 
             style="display:flex; align-items:center; gap:10px; padding:10px; cursor:pointer; border-radius:8px; transition:background 0.2s;"
             onmouseover="this.style.background='var(--bg-tertiary)'" 
             onmouseout="this.style.background='transparent'">
            <div style="width:24px; height:24px; border-radius:50%; background:${c.value};"></div>
            <span style="color:var(--text-primary);">${c.name}</span>
        </div>
    `).join('');

    const modalHTML = `
        <div id="colorModal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;" onclick="if(event.target.id==='colorModal') closeColorModal()">
            <div style="background:var(--bg-primary); padding:24px; border-radius:12px; max-width:300px; width:90%; box-shadow:var(--shadow-lg);">
                <h3 style="margin-bottom:16px; color:var(--text-primary);">Choose Class Color</h3>
                ${colorOptions}
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function setClassColor(classIndex, color) {
    classes[classIndex].color = color;
    save();
    render();
    renderAllItems();

    // Also update calendar if it's currently visible
    const calendarView = document.getElementById('calendarView');
    if (calendarView && calendarView.style.display !== 'none') {
        renderCalendar();
    }

    closeColorModal();
}

function closeColorModal() {
    const modal = document.getElementById('colorModal');
    if (modal) modal.remove();
}

// EDIT ITEM FUNCTION
function editItem(classIndex, itemIndex, type) {
    const item = type === 'assignment' ? classes[classIndex].assignments[itemIndex] : classes[classIndex].tests[itemIndex];

    // Create modal for editing
    const modalHTML = `
        <div id="editModal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000;">
            <div style="background:var(--bg-primary); padding:24px; border-radius:12px; max-width:500px; width:90%; box-shadow:var(--shadow-lg);">
                <h3 style="margin-bottom:16px; color:var(--text-primary);">Edit ${type === 'assignment' ? 'Assignment' : 'Test'}</h3>
                
                <div style="margin-bottom:12px;">
                    <label style="display:block; margin-bottom:4px; color:var(--text-primary);">Name:</label>
                    <input id="edit-name" type="text" value="${item.name}" style="width:100%; padding:10px; border:2px solid var(--border); border-radius:8px; background:var(--bg-primary); color:var(--text-primary);">
                </div>
                
                <div style="margin-bottom:12px;">
                    <label style="display:block; margin-bottom:4px; color:var(--text-primary);">Date:</label>
                    <input id="edit-date" type="date" value="${type === 'assignment' ? item.due : item.date}" style="width:100%; padding:10px; border:2px solid var(--border); border-radius:8px; background:var(--bg-primary); color:var(--text-primary);">
                </div>
                
                ${type === 'assignment' ? `
                <div style="margin-bottom:16px;">
                    <label style="display:block; margin-bottom:4px; color:var(--text-primary);">Time:</label>
                    <input id="edit-time" type="time" value="${item.time || '23:59'}" style="width:100%; padding:10px; border:2px solid var(--border); border-radius:8px; background:var(--bg-primary); color:var(--text-primary);">
                </div>
                ` : ''}
                
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button onclick="closeEditModal()" style="background:var(--bg-tertiary); color:var(--text-primary);">Cancel</button>
                    <button onclick="saveEdit(${classIndex}, ${itemIndex}, '${type}')">Save Changes</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    if (modal) modal.remove();
}

function saveEdit(classIndex, itemIndex, type) {
    const newName = document.getElementById('edit-name').value.trim().slice(0, 30);
    const newDate = document.getElementById('edit-date').value;

    if (!newName || !newDate) {
        alert('Please fill in all fields');
        return;
    }

    if (type === 'assignment') {
        const newTime = document.getElementById('edit-time').value || '23:59';
        classes[classIndex].assignments[itemIndex].name = newName;
        classes[classIndex].assignments[itemIndex].due = newDate;
        classes[classIndex].assignments[itemIndex].time = newTime;
    } else {
        classes[classIndex].tests[itemIndex].name = newName;
        classes[classIndex].tests[itemIndex].date = newDate;
    }

    save();
    render();
    renderAllItems();
    closeEditModal();
}

// EXPORT FUNCTIONS
function showExportMenu() {
    const menuHTML = `
        <div id="exportMenu" style="position:fixed; top:80px; right:20px; background:var(--bg-primary); padding:16px; border-radius:12px; box-shadow:var(--shadow-lg); z-index:1000; border:1px solid var(--border); min-width:200px;" onclick="event.stopPropagation()">
            <h3 style="margin:0 0 12px 0; color:var(--text-primary); font-size:1em;">Export Data</h3>
            <div style="display:flex; flex-direction:column; gap:8px;">
                <button onclick="exportToGoogleCalendar()" style="width:100%; text-align:left; padding:10px; background:var(--bg-secondary); border:none; border-radius:8px; cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                    <span>📅</span> Google Calendar
                </button>
                <button onclick="exportToCSV()" style="width:100%; text-align:left; padding:10px; background:var(--bg-secondary); border:none; border-radius:8px; cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                    <span>📊</span> Download CSV
                </button>
                <button onclick="exportToICS()" style="width:100%; text-align:left; padding:10px; background:var(--bg-secondary); border:none; border-radius:8px; cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                    <span>📆</span> Download ICS
                </button>
                <button onclick="printSchedule()" style="width:100%; text-align:left; padding:10px; background:var(--bg-secondary); border:none; border-radius:8px; cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                    <span>🖨️</span> Print/PDF
                </button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', menuHTML);

    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', closeExportMenu);
    }, 100);
}

function closeExportMenu() {
    const menu = document.getElementById('exportMenu');
    if (menu) {
        menu.remove();
        document.removeEventListener('click', closeExportMenu);
    }
}

// Export to Google Calendar
function exportToGoogleCalendar() {
    let calendarURL = 'https://calendar.google.com/calendar/r/eventedit?';
    let allItems = [];

    classes.forEach(cls => {
        cls.assignments.forEach(assignment => {
            allItems.push({
                title: `${assignment.name} (${cls.name})`,
                date: assignment.due,
                time: assignment.time || '23:59',
                type: 'assignment'
            });
        });

        cls.tests.forEach(test => {
            allItems.push({
                title: `TEST: ${test.name} (${cls.name})`,
                date: test.date,
                time: '09:00',
                type: 'test'
            });
        });
    });

    if (allItems.length === 0) {
        alert('No assignments or tests to export!');
        closeExportMenu();
        return;
    }

    // For multiple events, we'll create ICS and let them import
    alert(`Opening Google Calendar...\n\nTo add multiple events:\n1. Download the ICS file\n2. Go to Google Calendar\n3. Click Settings → Import & Export\n4. Upload the ICS file`);

    // Open Google Calendar import page
    window.open('https://calendar.google.com/calendar/u/0/r/settings/export', '_blank');

    // Also trigger ICS download
    setTimeout(() => exportToICS(), 500);

    closeExportMenu();
}

// Export to CSV
function exportToCSV() {
    let csv = 'Type,Name,Class,Due Date,Time,Progress/Prepared,Completed\n';

    classes.forEach(cls => {
        cls.assignments.forEach(assignment => {
            const dueDateTime = assignment.time ? `${assignment.due} ${assignment.time}` : assignment.due;
            csv += `Assignment,"${assignment.name}","${cls.name}",${assignment.due},${assignment.time || '23:59'},${assignment.progress}/10,${assignment.progress === 10 ? 'Yes' : 'No'}\n`;
        });

        cls.tests.forEach(test => {
            csv += `Test,"${test.name}","${cls.name}",${test.date},,${test.prepared}/10,${test.prepared === 10 ? 'Yes' : 'No'}\n`;
        });
    });

    // Create download
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `do2date-export-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    closeExportMenu();
}

// Export to ICS (iCalendar format - works with Google Calendar, Apple Calendar, Outlook)
function exportToICS() {
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Do2Date//Assignment Tracker//EN\nCALSCALE:GREGORIAN\n';

    classes.forEach(cls => {
        cls.assignments.forEach(assignment => {
            const dueDate = assignment.due.replace(/-/g, '');
            const dueTime = (assignment.time || '23:59').replace(':', '') + '00';

            ics += 'BEGIN:VEVENT\n';
            ics += `UID:${assignment.due}-${assignment.name.replace(/[^a-zA-Z0-9]/g, '')}-${cls.name.replace(/[^a-zA-Z0-9]/g, '')}@do2date.com\n`;
            ics += `DTSTART:${dueDate}T${dueTime}\n`;
            ics += `SUMMARY:${assignment.name} - ${cls.name}\n`;
            ics += `DESCRIPTION:Assignment for ${cls.name}\\nProgress: ${assignment.progress}/10\n`;
            ics += `CATEGORIES:ASSIGNMENT,${cls.name}\n`;
            ics += 'END:VEVENT\n';
        });

        cls.tests.forEach(test => {
            const testDate = test.date.replace(/-/g, '');

            ics += 'BEGIN:VEVENT\n';
            ics += `UID:${test.date}-${test.name.replace(/[^a-zA-Z0-9]/g, '')}-${cls.name.replace(/[^a-zA-Z0-9]/g, '')}@do2date.com\n`;
            ics += `DTSTART:${testDate}T090000\n`;
            ics += `SUMMARY:TEST: ${test.name} - ${cls.name}\n`;
            ics += `DESCRIPTION:Test for ${cls.name}\\nPrepared: ${test.prepared}/10\n`;
            ics += `CATEGORIES:TEST,${cls.name}\n`;
            ics += 'END:VEVENT\n';
        });
    });

    ics += 'END:VCALENDAR';

    // Create download
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `do2date-calendar-${new Date().toISOString().split('T')[0]}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    closeExportMenu();
}

// Print/Save as PDF
function printSchedule() {
    const printWindow = window.open('', '_blank');

    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Do2Date Schedule</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
                h1 { color: #6366f1; }
                h2 { color: #333; margin-top: 20px; border-bottom: 2px solid #6366f1; padding-bottom: 5px; }
                .class { margin-bottom: 30px; page-break-inside: avoid; }
                .item { margin: 10px 0; padding: 10px; border-left: 4px solid #10b981; background: #f9fafb; }
                .test { border-left-color: #f59e0b; }
                .completed { opacity: 0.6; text-decoration: line-through; }
                .date { font-weight: bold; color: #6366f1; }
                @media print {
                    body { padding: 10px; }
                    button { display: none; }
                }
            </style>
        </head>
        <body>
            <h1>📚 Do2Date Schedule</h1>
            <p>Generated: ${new Date().toLocaleDateString()}</p>
            <button onclick="window.print()" style="padding: 10px 20px; background: #6366f1; color: white; border: none; border-radius: 8px; cursor: pointer; margin-bottom: 20px;">Print / Save as PDF</button>
    `;

    classes.forEach(cls => {
        html += `<div class="class"><h2>${cls.name}</h2>`;

        // Combine and sort items
        let items = [];
        cls.assignments.forEach(a => items.push({ ...a, type: 'assignment', date: a.due }));
        cls.tests.forEach(t => items.push({ ...t, type: 'test' }));
        items.sort((a, b) => new Date(a.date) - new Date(b.date));

        items.forEach(item => {
            const completed = item.type === 'assignment' ? item.progress === 10 : item.prepared === 10;
            const progress = item.type === 'assignment' ? `${item.progress}/10` : `${item.prepared}/10`;
            const timeStr = item.time ? ` at ${formatTime(item.time)}` : '';

            html += `
                <div class="item ${item.type} ${completed ? 'completed' : ''}">
                    <strong>${item.name}</strong>
                    <br>
                    <span class="date">${formatDate(item.date)}${timeStr}</span>
                    <br>
                    ${item.type === 'assignment' ? 'Progress' : 'Prepared'}: ${progress}
                    ${completed ? ' ✓ Completed' : ''}
                </div>
            `;
        });

        html += '</div>';
    });

    html += '</body></html>';

    printWindow.document.write(html);
    printWindow.document.close();

    closeExportMenu();
}

// TOGGLE NOTIFICATIONS
async function toggleNotifications() {
    if (!('Notification' in window)) {
        alert('Your browser doesn\'t support notifications 😔');
        return;
    }

    if (Notification.permission === 'granted') {
        // Show info that notifications are enabled
        const disable = confirm('Notifications are currently enabled. \n\nNote: You can disable them in your browser settings.\n\nClick OK to test notifications.');
        if (disable) {
            showTestNotification();
        }
    } else if (Notification.permission === 'denied') {
        alert('Notifications are blocked. Please enable them in your browser settings.');
    } else {
        // Request permission
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            showTestNotification();
            scheduleNotificationCheck();
            updateNotificationIcon();
        }
    }
}

function updateNotificationIcon() {
    const notifBtn = document.getElementById('notificationToggle');
    if (notifBtn) {
        const granted = Notification.permission === 'granted';
        // A bell with a slash through it, rather than a different emoji. The
        // slash is the signal; the dimming is reinforcement, not the message.
        notifBtn.innerHTML = granted
            ? '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/><line x1="3" y1="3" x2="21" y2="21"/></svg>';
        notifBtn.classList.toggle('is-off', !granted);
        notifBtn.title = granted ? 'Notifications on' : 'Notifications off';
    }
}

// DARK MODE TOGGLE
/**
 * Sun when the theme is dark (tap to go light), moon when it is light.
 *
 * Defined once because there are two call sites — page load and the click
 * handler — and they had already drifted: the click handler was updated to SVG
 * while startup still wrote an emoji, so the icon was an emoji until you
 * happened to toggle it.
 */
function themeIconMarkup(theme) {
    return theme === 'dark'
        ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
}

function toggleDarkMode() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const toggleBtn = document.getElementById('darkModeToggle');

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    toggleBtn.innerHTML = themeIconMarkup(newTheme);
}

// Initialize theme on page load
(function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const toggleBtn = document.getElementById('darkModeToggle');

    document.documentElement.setAttribute('data-theme', savedTheme);
    if (toggleBtn) {
        toggleBtn.innerHTML = themeIconMarkup(savedTheme);
    }

    // Update notification icon
    updateNotificationIcon();
})();

// PWA INSTALLATION
let deferredPrompt;

// Register service worker
//
// This said '/service-worker.js' with hyphens. The file on disk is
// service_worker.js with an underscore, and has been since it was added — so
// registration 404'd on every load and the service worker never once ran. The
// PWA has had no offline support at all, and the run of commits titled "Fixed
// Service Worker" were fixing a file the browser was never fetching.
//
// If you rename the file, change this string in the same commit. A typo here
// fails silently in the console and nowhere a user would notice.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service_worker.js')
            .then(registration => {
                console.log('Service Worker registered successfully:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    });
}

// Listen for beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;

    // Show custom install prompt after a delay (don't be too pushy)
    setTimeout(() => {
        const installPrompt = document.getElementById('installPrompt');
        const installDismissed = localStorage.getItem('installDismissed');

        // Only show if user hasn't dismissed it before
        if (!installDismissed && installPrompt) {
            installPrompt.style.display = 'block';
        }
    }, 3000); // Show after 3 seconds
});

// Handle install button click
const installButton = document.getElementById('installButton');
if (installButton) {
    installButton.addEventListener('click', async () => {
        if (!deferredPrompt) {
            return;
        }

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;

        console.log(`User response to install prompt: ${outcome}`);

        // Hide the prompt
        document.getElementById('installPrompt').style.display = 'none';

        // Clear the deferredPrompt variable
        deferredPrompt = null;
    });
}

// Handle dismiss button click
const dismissInstall = document.getElementById('dismissInstall');
if (dismissInstall) {
    dismissInstall.addEventListener('click', () => {
        document.getElementById('installPrompt').style.display = 'none';
        // Remember that user dismissed it
        localStorage.setItem('installDismissed', 'true');
    });
}

// Detect if app is already installed
window.addEventListener('appinstalled', () => {
    console.log('Do2Date was installed');
    // Hide install prompt if visible
    const installPrompt = document.getElementById('installPrompt');
    if (installPrompt) {
        installPrompt.style.display = 'none';
    }
});

// NOTIFICATIONS SYSTEM
// Check and request notification permission
function checkNotificationPermission() {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') {
        return true;
    } else if (Notification.permission !== 'denied') {
        // Ask for permission after a delay (not immediately on page load)
        setTimeout(() => {
            const notifDismissed = localStorage.getItem('notificationPromptDismissed');
            if (!notifDismissed) {
                showNotificationPrompt();
            }
        }, 5000); // Show after 5 seconds
    }

    return false;
}

function showNotificationPrompt() {
    const promptHTML = `
        <div id="notificationPrompt" style="position:fixed; top:20px; right:20px; background:var(--bg-primary); padding:16px 20px; border-radius:12px; box-shadow:var(--shadow-lg); z-index:1000; border:2px solid var(--primary); max-width:90%; width:350px; animation: slideIn 0.3s ease;">
            <div style="margin-bottom:12px;">
                <strong style="display:block; margin-bottom:4px; color:var(--text-primary); font-size:1em;">🔔 Stay on top of deadlines</strong>
                <span style="font-size:0.9em; color:var(--text-secondary);">Get notified when assignments are due soon</span>
            </div>
            <div style="display:flex; gap:8px; justify-content:flex-end;">
                <button id="enableNotifications" style="background:var(--primary); color:white; padding:8px 16px; border:none; border-radius:8px; cursor:pointer; font-weight:500;">Enable</button>
                <button id="dismissNotifications" style="background:var(--bg-tertiary); color:var(--text-primary); padding:8px 16px; border:none; border-radius:8px; cursor:pointer;">Not Now</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', promptHTML);

    // Handle enable button
    document.getElementById('enableNotifications').addEventListener('click', async () => {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            showTestNotification();
            scheduleNotificationCheck();
        }
        document.getElementById('notificationPrompt').remove();
    });

    // Handle dismiss button
    document.getElementById('dismissNotifications').addEventListener('click', () => {
        document.getElementById('notificationPrompt').remove();
        localStorage.setItem('notificationPromptDismissed', 'true');
    });
}

function showTestNotification() {
    new Notification('🎉 Notifications enabled!', {
        body: 'You\'ll be notified about upcoming assignments and tests.',
        icon: '/icon-192.png',
        badge: '/icon-192.png'
    });
}

// Check for upcoming items and send notifications
function checkUpcomingDeadlines() {
    if (Notification.permission !== 'granted') return;

    // THE BUG THIS REPLACES, and it fired every day of the year, not just at
    // DST. The old code did:
    //
    //     const dueDate = new Date(assignment.due);  // "2026-09-04" -> 00:00 UTC
    //     dueDate.setHours(0, 0, 0, 0);              // -> local midnight of SEP 3
    //
    // In any timezone behind UTC, "2026-09-04" parses to 8pm on September 3
    // local, and setHours then floors it to September 3. So every deadline was
    // compared as if it were a day earlier than it is: the "Due Today" push
    // arrived a day EARLY, and on the actual due date the item had already
    // slipped into the past and produced no notification at all.
    //
    // dueBucket does the whole comparison in the student's zone. See dates.js.
    const timeZone = getTimeZone();
    let dueTodayCount = 0;
    let dueTomorrowCount = 0;
    let dueThisWeekCount = 0;

    classes.forEach(cls => {
        (cls.assignments || []).concat(cls.tests || []).forEach(item => {
            const bucket = Do2DateDates.dueBucket(item, timeZone);
            if (bucket === 'today') dueTodayCount++;
            else if (bucket === 'tomorrow') dueTomorrowCount++;
            else if (bucket === 'this_week') dueThisWeekCount++;
        });
    });

    // Send notifications based on what's due
    const lastNotificationDate = localStorage.getItem('lastNotificationDate');
    // Also zone-explicit. The old version called toISOString() on a local
    // midnight, which in Europe reports YESTERDAY's date — so the once-a-day
    // guard let the summary fire twice.
    const todayString = Do2DateDates.todayInZone(timeZone);

    // Only send daily summary once per day
    if (lastNotificationDate !== todayString) {
        if (dueTodayCount > 0) {
            new Notification('📚 Due Today!', {
                body: `You have ${dueTodayCount} assignment${dueTodayCount > 1 ? 's' : ''} due today. Better get started!`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'due-today'
            });
        }

        if (dueTomorrowCount > 0) {
            new Notification('⏰ Due Tomorrow', {
                body: `${dueTomorrowCount} item${dueTomorrowCount > 1 ? 's' : ''} due tomorrow. Don't forget!`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'due-tomorrow'
            });
        }

        localStorage.setItem('lastNotificationDate', todayString);
    }
}

// Schedule periodic notification checks
function scheduleNotificationCheck() {
    // Check immediately
    checkUpcomingDeadlines();

    // Then check every hour
    setInterval(checkUpcomingDeadlines, 60 * 60 * 1000);

    // Also check when page becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            checkUpcomingDeadlines();
        }
    });
}

// Initialize notifications on page load
setTimeout(() => {
    checkNotificationPermission();
    if (Notification.permission === 'granted') {
        scheduleNotificationCheck();
    }
}, 2000);

// FIREBASE AUTHENTICATION & SYNC - COMPLETE WORKING VERSION
let currentUser = null;
let isGuestMode = false;
let authInitialized = false;

function initializeAuth() {
    // Prevent multiple initializations
    if (authInitialized) return;

    // Wait for Firebase to be ready
    if (!window.firebaseAuth || !window.firebaseReady) {
        setTimeout(initializeAuth, 100);
        return;
    }

    authInitialized = true;
    console.log('🔥 Firebase auth initializing...');

    // Whether the student previously chose "continue without signing in".
    const skipLogin = localStorage.getItem('skipLogin');

    // THE BUG THIS REPLACES: when skipLogin was set, this returned early and
    // never registered the auth listener at all. Firebase persists a session
    // across reloads, so someone who had genuinely signed in — but had ALSO
    // tapped "continue without signing in" at some point in the past — was
    // treated as a guest forever. currentUser stayed null, firebaseAuth
    // .currentUser stayed null, and nothing in the UI explained why. It
    // surfaced as syllabus upload insisting "sign in to read a syllabus" at a
    // student who was, in every ordinary sense, signed in.
    //
    // skipLogin should only decide whether we PROMPT. It should never decide
    // whether we notice an existing session.
    window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
        console.log('🔐 Auth state changed:', user ? user.email : 'not signed in');

        if (user) {
            // A real session wins over a stale guest preference. Clearing the
            // flag means the choice does not come back to haunt them later.
            localStorage.removeItem('skipLogin');
            handleUserSignedIn(user);
        } else if (skipLogin) {
            // Chose guest, and has no session. Respect that: no modal, just
            // the Sign In button in the header.
            console.log('👤 Guest mode - using localStorage only');
            isGuestMode = true;
            const signInButton = document.getElementById('signInButton');
            if (signInButton) signInButton.style.display = 'block';
        } else {
            handleUserSignedOut();
        }
    });
}

function handleUserSignedIn(user) {
    currentUser = user;
    isGuestMode = false;

    console.log('✅ User signed in:', user.email);

    // Hide modal and sign-in button
    hideAuthModal();
    const signInButton = document.getElementById('signInButton');
    if (signInButton) signInButton.style.display = 'none';

    // Show user button
    const userButton = document.getElementById('userButton');
    if (userButton) userButton.style.display = 'block';

    // Load user's data from Firebase
    loadUserDataFromFirebase(user.uid);

    // Set up real-time sync
    setupRealtimeSync(user.uid);
}

function handleUserSignedOut() {
    currentUser = null;

    console.log('❌ User signed out');

    // Only show modal if not in guest mode
    if (!isGuestMode) {
        showAuthModal();
    }

    // Hide user button
    const userButton = document.getElementById('userButton');
    if (userButton) userButton.style.display = 'none';
}

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'flex';
        console.log('📋 Showing auth modal');
    }
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
        console.log('✖️ Hiding auth modal');
    }
}

function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => errorDiv.style.display = 'none', 5000);
    }
}

// SIGN IN WITH EMAIL
async function signInWithEmail() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }

    try {
        console.log('📧 Attempting email sign-in...');
        await window.firebaseSignInWithEmailAndPassword(window.firebaseAuth, email, password);
        console.log('✅ Email sign-in successful');
    } catch (error) {
        console.error('❌ Sign in error:', error);
        showAuthError(error.message || 'Failed to sign in');
    }
}

// SIGN UP WITH EMAIL
async function signUpWithEmail() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }

    if (password.length < 6) {
        showAuthError('Password must be at least 6 characters');
        return;
    }

    try {
        console.log('📝 Creating account...');
        await window.firebaseCreateUserWithEmailAndPassword(window.firebaseAuth, email, password);
        console.log('✅ Account created successfully');
    } catch (error) {
        console.error('❌ Sign up error:', error);
        showAuthError(error.message || 'Failed to create account');
    }
}

// SIGN IN WITH GOOGLE
async function signInWithGoogle() {
    const provider = new window.firebaseGoogleAuthProvider();

    try {
        console.log('🔵 Attempting Google sign-in...');
        await window.firebaseSignInWithPopup(window.firebaseAuth, provider);
        console.log('✅ Google sign-in successful');
    } catch (error) {
        console.error('❌ Google sign in error:', error);
        showAuthError(error.message || 'Failed to sign in with Google');
    }
}

// CONTINUE WITHOUT SIGNING IN
function continueWithoutLogin() {
    console.log('👤 Continuing as guest');
    localStorage.setItem('skipLogin', 'true');
    isGuestMode = true;
    hideAuthModal();

    const signInButton = document.getElementById('signInButton');
    if (signInButton) signInButton.style.display = 'block';
}

// SHOW AUTH MODAL AGAIN (for guests who change their mind)
function showAuthModalAgain() {
    console.log('🔄 Guest choosing to sign in');
    localStorage.removeItem('skipLogin');
    isGuestMode = false;

    const signInButton = document.getElementById('signInButton');
    if (signInButton) signInButton.style.display = 'none';

    showAuthModal();
}

// SIGN OUT
async function signOutUser() {
    try {
        console.log('🚪 Signing out...');
        await window.firebaseSignOut(window.firebaseAuth);
        localStorage.removeItem('skipLogin');
        isGuestMode = false;

        // Clear local data
        classes = [];
        localStorage.removeItem('classes');
        localStorage.removeItem('displayName');
        displayName = '';
        render();

        console.log('✅ Signed out successfully');

        closeUserMenu();
    } catch (error) {
        console.error('❌ Sign out error:', error);
        alert('Failed to sign out');
    }
}

// LOAD DATA FROM FIREBASE
async function loadUserDataFromFirebase(userId) {
    console.log('📥 Loading data from Firebase for user:', userId);

    // Before the classes, so the first render already uses the right zone
    // rather than painting every due date twice.
    await loadTimezoneFromFirebase(userId);
    await loadDisplayNameFromFirebase(userId);

    try {
        const userDataRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/classes`);
        const snapshot = await window.firebaseGet(userDataRef);

        if (snapshot.exists()) {
            console.log('☁️ Cloud data found');
            const firebaseData = snapshot.val();
            const localData = JSON.parse(localStorage.getItem('classes') || '[]');

            if (localData.length === 0) {
                // No local data - use cloud data
                console.log('✅ Using cloud data (no local data)');
                classes = firebaseData;
            } else {
                // Both local and cloud data exist - ask user
                const asked = sessionStorage.getItem('mergeAsked');

                if (!asked) {
                    sessionStorage.setItem('mergeAsked', 'true');

                    const useCloud = confirm(
                        'You have data on this device and in the cloud.\n\n' +
                        'Click OK to use cloud data\n' +
                        'Click Cancel to keep local data and upload to cloud'
                    );

                    if (useCloud) {
                        console.log('☁️ User chose cloud data');
                        classes = firebaseData;
                    } else {
                        console.log('💾 User chose local data - uploading to cloud');
                        classes = localData;
                        saveToFirebase(userId);
                    }
                } else {
                    // Already asked - use local
                    classes = localData;
                }
            }

            localStorage.setItem('classes', JSON.stringify(classes));
            render();
            console.log('✅ Data loaded successfully');
        } else {
            // No cloud data - check for local data
            console.log('📭 No cloud data found');
            const localData = JSON.parse(localStorage.getItem('classes') || '[]');

            if (localData.length > 0) {
                console.log('💾 Uploading local data to cloud');
                classes = localData;
                saveToFirebase(userId);
            } else {
                console.log('📝 Starting fresh - no data anywhere');
                classes = [];
            }

            render();
        }
    } catch (error) {
        console.error('❌ Error loading data from Firebase:', error);
        // Fallback to local data on error
        classes = JSON.parse(localStorage.getItem('classes') || '[]');
        render();
    }
}

// SAVE TO FIREBASE
function saveToFirebase(userId) {
    if (!userId || isGuestMode) {
        console.log('⏭️ Skipping Firebase save (guest mode or no user)');
        return;
    }

    try {
        const userDataRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/classes`);
        window.firebaseSet(userDataRef, classes);

        // Stored next to the classes so it follows the student across devices.
        // A phone and a laptop in the same bag should not disagree about
        // whether an assignment is late.
        const tzRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/timezone`);
        window.firebaseSet(tzRef, getTimeZone());

        console.log('☁️ Saved to Firebase');
    } catch (error) {
        console.error('❌ Error saving to Firebase:', error);
    }
}

/**
 * Pull the saved zone down at sign-in.
 *
 * The browser's zone wins only when nothing is stored yet. Otherwise a student
 * who set "America/New_York" and then opened the app from a hotel in Berlin
 * would have it silently overwritten — which is the exact failure the setting
 * exists to prevent.
 */
async function loadTimezoneFromFirebase(userId) {
    try {
        const tzRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/timezone`);
        const snapshot = await window.firebaseGet(tzRef);
        if (snapshot.exists()) {
            const stored = snapshot.val();
            if (Do2DateDates.isValidTimeZone(stored)) {
                userTimezone = stored;
                localStorage.setItem('timezone', stored);
                console.log('🕐 Timezone from cloud:', stored);
            }
        }
    } catch (error) {
        console.error('❌ Error loading timezone:', error);
    }
}

// SET UP REAL-TIME SYNC
function setupRealtimeSync(userId) {
    console.log('🔄 Setting up real-time sync');

    const userDataRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/classes`);

    window.firebaseOnValue(userDataRef, (snapshot) => {
        if (snapshot.exists()) {
            const firebaseData = snapshot.val();

            // Only update if data actually changed
            if (JSON.stringify(firebaseData) !== JSON.stringify(classes)) {
                console.log('🔄 Syncing data from cloud');
                classes = firebaseData;
                localStorage.setItem('classes', JSON.stringify(classes));
                render();
            }
        }
    });
}

// OVERRIDE SAVE FUNCTION TO INCLUDE FIREBASE
const originalSave = save;
save = function() {
    // Always save to localStorage first
    originalSave();

    // Also save to Firebase if user is signed in
    if (currentUser && !isGuestMode) {
        console.log('💾 Saving to localStorage AND Firebase');
        saveToFirebase(currentUser.uid);
    } else {
        console.log('💾 Saving to localStorage only');
    }
};

/**
 * Options for the time-zone picker.
 *
 * Intl.supportedValuesOf gives the full IANA list where it exists (every
 * current browser); the short list is the fallback for older ones, not a
 * curated "popular zones" menu — a student in Adelaide should not be told their
 * zone is unavailable. The detected zone is always included, so whatever the
 * device reports is selectable even if it is missing from the fallback.
 */
function timezoneOptions() {
    const current = getTimeZone();
    let zones;
    try {
        zones = Intl.supportedValuesOf('timeZone');
    } catch (e) {
        zones = [
            'UTC', 'America/New_York', 'America/Chicago', 'America/Denver',
            'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
            'America/Toronto', 'America/Sao_Paulo', 'Europe/London',
            'Europe/Berlin', 'Europe/Madrid', 'Europe/Athens', 'Africa/Lagos',
            'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Bangkok',
            'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Australia/Perth',
            'Australia/Adelaide', 'Australia/Sydney', 'Pacific/Auckland'
        ];
    }
    if (zones.indexOf(current) === -1) zones = [current].concat(zones);

    return zones.map(zone =>
        `<option value="${zone}"${zone === current ? ' selected' : ''}>${zone.replace(/_/g, ' ')}</option>`
    ).join('');
}

// SHOW USER MENU
function showUserMenu() {
    const email = currentUser?.email || 'Guest';
    const menuHTML = `
        <div id="userMenu" style="position:fixed; top:80px; right:20px; background:var(--bg-primary); padding:16px; border-radius:12px; box-shadow:var(--shadow-lg); z-index:1000; border:1px solid var(--border); min-width:250px;" onclick="event.stopPropagation()">
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border);">
                <div style="font-size:0.85em; color:var(--text-secondary);">Signed in as</div>
                <div style="font-weight:600; color:var(--text-primary); margin-top:4px; word-break:break-all;">${email}</div>
            </div>
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border);">
                <label for="nameInput" style="font-size:0.85em; color:var(--text-secondary); display:block; margin-bottom:6px;">Leaderboard name</label>
                <input id="nameInput" maxlength="20" value="${escapeHtml(displayName)}" placeholder="Not set yet"
                       onchange="saveDisplayName(this.value)"
                       style="width:100%; padding:10px; border:2px solid var(--border); border-radius:8px; background:var(--bg-secondary); color:var(--text-primary); min-height:44px;">
                <div style="font-size:0.75em; color:var(--text-secondary); margin-top:6px;">
                    Public. Shown on game leaderboards — never your email.
                </div>
            </div>
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border);">
                <label for="tzSelect" style="font-size:0.85em; color:var(--text-secondary); display:block; margin-bottom:6px;">Time zone</label>
                <select id="tzSelect" onchange="setTimeZone(this.value)" style="width:100%; padding:10px; border:2px solid var(--border); border-radius:8px; background:var(--bg-secondary); color:var(--text-primary); min-height:44px;">
                    ${timezoneOptions()}
                </select>
                <div style="font-size:0.75em; color:var(--text-secondary); margin-top:6px;">
                    Due dates are judged in this zone, not your device's.
                </div>
            </div>
            <button onclick="signOutUser()" style="width:100%; text-align:left; padding:10px; background:var(--bg-secondary); border:none; border-radius:8px; cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:8px; min-height:44px;">
                <span>🚪</span> Sign Out
            </button>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', menuHTML);

    setTimeout(() => {
        document.addEventListener('click', closeUserMenu);
    }, 100);
}

function closeUserMenu() {
    const menu = document.getElementById('userMenu');
    if (menu) {
        menu.remove();
        document.removeEventListener('click', closeUserMenu);
    }
}

// INITIALIZE AUTH WHEN READY
console.log('⏳ Waiting for Firebase to be ready...');

if (window.firebaseReady) {
    initializeAuth();
} else {
    const checkFirebase = setInterval(() => {
        if (window.firebaseReady) {
            clearInterval(checkFirebase);
            initializeAuth();
        }
    }, 100);
}