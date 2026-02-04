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

// ELEMENTS
const addClassBtn = document.getElementById("addClassBtn");
const classInput = document.getElementById("classInput");
const classesContainer = document.getElementById("classesContainer");

// SAVE
function save() {
    localStorage.setItem("classes", JSON.stringify(classes));
}

// HELPER: due-in text
function dueInText(dueDateStr) {
    const today = new Date();
    // Parse date as local time, not UTC
    const [year, month, day] = dueDateStr.split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);

    today.setHours(0,0,0,0);
    dueDate.setHours(0,0,0,0);

    const diffTime = dueDate - today;
    const diffDays = Math.round(diffTime / (1000*60*60*24));

    if (diffDays < 0) return "Past due";
    if (diffDays === 0) return "Due today";
    if (diffDays === 1) return "Due tomorrow";
    if (diffDays < 7) return `Due in ${diffDays} day${diffDays>1?"s":""}`;

    const weeks = Math.floor(diffDays/7);
    const days = diffDays % 7;
    let text = `Due in ${weeks} week${weeks>1?"s":""}`;
    if (days>0) text += ` and ${days} day${days>1?"s":""}`;
    return text;
}

// HELPER: format MM/DD
function formatDate(dueDateStr) {
    // Parse date as local time, not UTC
    const [year, month, day] = dueDateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${mm}/${dd}`;
}

// HELPER: format time (24hr to 12hr)
function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
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

        const baseDate = new Date(dueInput.value);

        for (let i = 0; i < occurrences; i++) {
            const currentDate = new Date(baseDate);
            currentDate.setDate(currentDate.getDate() + (i * interval));

            const dateStr = currentDate.toISOString().split('T')[0];
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
    classes.forEach((cls, classIndex) => {
        const classDiv = document.createElement("div");
        classDiv.className = "class-card";

        const uncompletedCount = cls.assignments.filter(a => a.progress < 10).length;
        const displayClassName = cls.name.length > 25 ? cls.name.slice(0,25) + "…" : cls.name;

        // Sort assignments by due date
        const sortedAssignments = [...cls.assignments]
            .map((a, idx) => ({...a, originalIndex: idx}))
            .sort((a, b) => new Date(a.due) - new Date(b.due));

        // Sort tests by date
        const sortedTests = [...cls.tests]
            .map((t, idx) => ({...t, originalIndex: idx}))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        classDiv.innerHTML = `
        <div class="class-header" onclick="toggleClass(${classIndex})" style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center;">
                <span id="toggle-icon-${classIndex}" style="margin-right:8px;">${cls.isOpen ? '▼' : '▶'}</span>
                <div style="width:8px; height:8px; border-radius:50%; background:${cls.color}; margin-right:10px;"></div>
                <h2 title="${cls.name}" style="margin:0;">${displayClassName}</h2>
                <button onclick="event.stopPropagation(); changeClassColor(${classIndex})" style="margin-left:12px; padding:4px 10px; font-size:0.8em; background:var(--bg-tertiary); color:var(--text-secondary);" title="Change color">🎨</button>
            </div>
            <span class="assignment-count">${uncompletedCount} assignments</span>
        </div>

        <div id="items-container-${classIndex}" style="display:${cls.isOpen ? 'block' : 'none'}; margin-top:10px;">
            <!-- Add buttons -->
            <div style="margin-bottom:10px; display:flex; gap:8px;">
                <button onclick="toggleAddAssignment(${classIndex})" id="show-add-assignment-${classIndex}">+ Add Assignment</button>
                <button onclick="toggleAddTest(${classIndex})" id="show-add-test-${classIndex}">+ Add Test</button>
            </div>
            
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
                        🔄 Recurring
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
            <div id="add-test-form-${classIndex}" style="display:none; margin-bottom:10px; padding:10px; background:#f9f9f9; border-radius:4px;">
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                    <input id="t-name-${classIndex}" placeholder="Test name" style="flex: 1; min-width: 150px;">
                    <input id="t-date-${classIndex}" type="date" style="width: 140px;">
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="addTest(${classIndex})">Save Test</button>
                    <button onclick="cancelAddTest(${classIndex})" style="background:#ccc;">Cancel</button>
                </div>
            </div>

            <!-- ASSIGNMENTS SECTION -->
            ${sortedAssignments.length > 0 ? '<h3 style="margin-top:15px; margin-bottom:8px; font-size:1.1em;">Assignments</h3>' : ''}
            ${sortedAssignments.map((a) => {
            const completed = a.progress === 10;
            const displayAssignmentName = a.name.length > 30 ? a.name.slice(0,30) + "…" : a.name;
            const timeDisplay = a.time ? formatTime(a.time) : '';
            return `
            <div class="assignment ${completed ? 'completed' : ''}">
                <div style="display:flex; justify-content: space-between; align-items:center;">
                    <div>
                        <strong title="${a.name}">${displayAssignmentName}</strong>
                        <span style="font-size:0.85em; color:#555; margin-left:8px;">
                            ${formatDate(a.due)}${timeDisplay ? ' at ' + timeDisplay : ''} (${dueInText(a.due)})
                        </span>
                    </div>
                </div>
                <div>
                    Progress:
                    <input type="range" min="0" max="10" value="${a.progress}" 
                           oninput="updateAssignmentProgress(${classIndex},${a.originalIndex},this.value)">
                    ${a.progress}/10
                </div>
                ${completed ? `<div class="completed-label">✔ Completed</div>` : ''}
                <div style="margin-top:6px; display:flex; gap:8px;">
                    <button onclick="editItem(${classIndex}, ${a.originalIndex}, 'assignment')">Edit</button>
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
            return `
            <div class="test ${ready ? 'completed' : ''}">
                <div style="display:flex; justify-content: space-between; align-items:center;">
                    <div>
                        <strong title="${t.name}">${displayTestName}</strong>
                        <span style="font-size:0.85em; color:#555; margin-left:8px;">
                            ${formatDate(t.date)} (${dueInText(t.date)})
                        </span>
                    </div>
                </div>
                <div>
                    Prepared:
                    <input type="range" min="0" max="10" value="${t.prepared}" 
                           oninput="updateTestPrepared(${classIndex},${t.originalIndex},this.value)">
                    ${t.prepared}/10
                </div>
                ${ready ? `<div class="completed-label">✔ Ready</div>` : ''}
                <div style="margin-top:6px; display:flex; gap:8px;">
                    <button onclick="editItem(${classIndex}, ${t.originalIndex}, 'test')">Edit</button>
                    <button onclick="removeTest(${classIndex},${t.originalIndex})">Remove</button>
                </div>
            </div>
        `;
        }).join('')}

            <div style="margin-top:15px; text-align:right;">
                <button onclick="removeClass(${classIndex})" style="background:#ccc; color:#000; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
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

    // Sort by date
    allItems.sort((a, b) => new Date(a.date) - new Date(b.date));

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
                <p style="text-align:center; color:#999; padding:40px;">${filterText}</p>
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
                                ${formatDate(item.date)}${isAssignment && item.time ? ' at ' + formatTime(item.time) : ''} (${dueInText(item.date)})
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
                    ${completed ? `<div class="completed-label">✔ ${isAssignment ? 'Completed' : 'Ready'}</div>` : ''}
                    <div style="margin-top:8px; display:flex; gap:8px;">
                        <button onclick="editItem(${item.classIndex}, ${item.itemIndex}, '${item.type}')" style="font-size:0.85em; padding:6px 12px;">Edit</button>
                        <button onclick="${isAssignment ? 'removeAssignment' : 'removeTest'}(${item.classIndex},${item.itemIndex}); renderAllItems();" style="font-size:0.85em; padding:6px 12px; background:#ef4444;">Remove</button>
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
        if (Notification.permission === 'granted') {
            notifBtn.textContent = '🔔';
            notifBtn.style.opacity = '1';
        } else {
            notifBtn.textContent = '🔕';
            notifBtn.style.opacity = '0.5';
        }
    }
}

// DARK MODE TOGGLE
function toggleDarkMode() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    const toggleBtn = document.getElementById('darkModeToggle');

    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Update button icon
    toggleBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

// Initialize theme on page load
(function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const toggleBtn = document.getElementById('darkModeToggle');

    document.documentElement.setAttribute('data-theme', savedTheme);
    if (toggleBtn) {
        toggleBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    }

    // Update notification icon
    updateNotificationIcon();
})();

// PWA INSTALLATION
let deferredPrompt;

// Register service worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
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

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);

    let dueTodayCount = 0;
    let dueTomorrowCount = 0;
    let dueThisWeekCount = 0;

    classes.forEach(cls => {
        cls.assignments.forEach(assignment => {
            if (assignment.progress >= 10) return; // Skip completed

            const dueDate = new Date(assignment.due);
            dueDate.setHours(0, 0, 0, 0);

            if (dueDate.getTime() === now.getTime()) {
                dueTodayCount++;
            } else if (dueDate.getTime() === tomorrow.getTime()) {
                dueTomorrowCount++;
            } else if (dueDate >= now && dueDate <= nextWeek) {
                dueThisWeekCount++;
            }
        });

        cls.tests.forEach(test => {
            if (test.prepared >= 10) return; // Skip if ready

            const testDate = new Date(test.date);
            testDate.setHours(0, 0, 0, 0);

            if (testDate.getTime() === now.getTime()) {
                dueTodayCount++;
            } else if (testDate.getTime() === tomorrow.getTime()) {
                dueTomorrowCount++;
            } else if (testDate >= now && testDate <= nextWeek) {
                dueThisWeekCount++;
            }
        });
    });

    // Send notifications based on what's due
    const lastNotificationDate = localStorage.getItem('lastNotificationDate');
    const todayString = now.toISOString().split('T')[0];

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

// FIREBASE AUTHENTICATION & SYNC
let authInitialized = false;
let currentUser = null;
let isGuestMode = false;

function initializeAuth() {
    // Wait for Firebase to be ready
    if (!window.firebaseAuth || !window.firebaseReady) {
        console.log('Waiting for Firebase to initialize...');
        setTimeout(initializeAuth, 100);
        return;
    }

    console.log('Firebase ready, initializing auth...');

    // CHECK FOR REDIRECT RESULT FIRST (important!)
    checkRedirectResult();

    // Check if user wants to skip login
    const skipLogin = localStorage.getItem('skipLogin');

    if (skipLogin) {
        isGuestMode = true;
        hideAuthModal();

        // Show sign-in button for guest users
        const signInButton = document.getElementById('signInButton');
        if (signInButton) {
            signInButton.style.display = 'block';
        }
        return;
    }

    // Listen for auth state changes
    window.firebaseOnAuthStateChanged(window.firebaseAuth, (user) => {
        console.log('Auth state changed:', user ? user.email : 'no user');

        if (user) {
            currentUser = user;
            authInitialized = true;
            onUserSignedIn(user);
        } else {
            currentUser = null;

            // IMPORTANT: only show modal AFTER Firebase finishes init
            if (authInitialized && !isGuestMode) {
                showAuthModal();
            }
        }
    });
}

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'flex';  // Changed from just setting display
    }
}

function hideAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

// Sign in with email/password
async function signInWithEmail() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;

    if (!email || !password) {
        showAuthError('Please enter email and password');
        return;
    }

    try {
        await window.firebaseSignInWithEmailAndPassword(window.firebaseAuth, email, password);
    } catch (error) {
        console.error('Sign in error:', error);
        showAuthError(error.message || 'Failed to sign in');
    }
}

// Sign up with email/password
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
        await window.firebaseCreateUserWithEmailAndPassword(window.firebaseAuth, email, password);
    } catch (error) {
        console.error('Sign up error:', error);
        showAuthError(error.message || 'Failed to create account');
    }
}

// Sign in with Google - USE REDIRECT (more reliable)
async function signInWithGoogle() {
    const provider = new window.firebaseGoogleAuthProvider();

    try {
        // Import redirect function
        const auth = window.firebaseAuth;

        // Use signInWithRedirect - this works better on desktop
        const { signInWithRedirect } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');

        console.log('Starting Google sign-in redirect...');
        await signInWithRedirect(auth, provider);

        // Page will redirect away, then come back after sign-in
    } catch (error) {
        console.error('Google sign in error:', error);
        showAuthError(error.message || 'Failed to sign in with Google');
    }
}

// Handle redirect result when user comes back from Google sign-in
async function checkRedirectResult() {
    try {
        const { getRedirectResult } = await import(
            'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js'
            );

        const result = await getRedirectResult(window.firebaseAuth);

        if (result && result.user) {
            console.log('Google sign-in successful!', result.user.email);
        }

        // 🔑 Tell the app Firebase is done restoring session
        authInitialized = true;

    } catch (error) {
        authInitialized = true;
        if (error.code !== 'auth/popup-closed-by-user') {
            console.error('Redirect result error:', error);
        }
    }
}


// Continue without signing in
function continueWithoutLogin() {
    localStorage.setItem('skipLogin', 'true');
    isGuestMode = true;
    hideAuthModal();

    // Show sign-in button for guest users
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.style.display = 'block';
    }
}

// Show auth modal again (for guest users who change their mind)
function showAuthModalAgain() {
    localStorage.removeItem('skipLogin');
    isGuestMode = false;

    // Hide sign-in button
    const signInButton = document.getElementById('signInButton');
    if (signInButton) {
        signInButton.style.display = 'none';
    }

    showAuthModal();
}

// Sign out
async function signOutUser() {
    try {
        await window.firebaseSignOut(window.firebaseAuth);
        localStorage.removeItem('skipLogin');
        isGuestMode = false;

        // Clear local data
        classes = [];
        localStorage.removeItem('classes');
        render();

        // Show auth modal again
        showAuthModal();
        closeUserMenu();
    } catch (error) {
        console.error('Sign out error:', error);
        alert('Failed to sign out');
    }
}

// When user signs in successfully
function onUserSignedIn(user) {
    console.log('User signed in:', user.email);

    // Set flag
    isGuestMode = false;

    // Hide modal and sign-in button
    hideAuthModal();
    const signInButton = document.getElementById('signInButton');
    if (signInButton) signInButton.style.display = 'none';

    // Show user button
    const userButton = document.getElementById('userButton');
    if (userButton) userButton.style.display = 'block';

    // Load data (this runs async, won't block)
    loadUserDataFromFirebase(user.uid);
    setupRealtimeSync(user.uid);
}

// Load data from Firebase
async function loadUserDataFromFirebase(userId) {
    console.log('Loading data for user:', userId);

    try {
        const userDataRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/classes`);
        const snapshot = await window.firebaseGet(userDataRef);

        if (snapshot.exists()) {
            const firebaseData = snapshot.val();
            const localData = JSON.parse(localStorage.getItem('classes') || '[]');

            if (localData.length === 0) {
                // No local data, use cloud data
                classes = firebaseData;
            } else {
                // Only ask ONCE per session
                const asked = sessionStorage.getItem('mergeAsked');

                if (!asked) {
                    sessionStorage.setItem('mergeAsked', 'true');

                    const useCloud = confirm(
                        'You have data on this device and in the cloud.\n\n' +
                        'OK = Use cloud data\n' +
                        'Cancel = Keep local data and sync to cloud'
                    );

                    if (useCloud) {
                        classes = firebaseData;
                    } else {
                        classes = localData;
                        saveToFirebase(userId);
                    }
                } else {
                    // Already asked, use local
                    classes = localData;
                }
            }

            localStorage.setItem('classes', JSON.stringify(classes));
            render();
        } else {
            // No cloud data, upload local if exists
            const localData = JSON.parse(localStorage.getItem('classes') || '[]');
            if (localData.length > 0) {
                classes = localData;
                saveToFirebase(userId);
            }
            render();
        }
    } catch (error) {
        console.error('Load error:', error);
        classes = JSON.parse(localStorage.getItem('classes') || '[]');
        render();
    }
}

// Save data to Firebase
function saveToFirebase(userId) {
    if (!userId || isGuestMode) return;

    try {
        const userDataRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/classes`);
        window.firebaseSet(userDataRef, classes);
    } catch (error) {
        console.error('Error saving to Firebase:', error);
    }
}

// Set up real-time sync
function setupRealtimeSync(userId) {
    const userDataRef = window.firebaseRef(window.firebaseDatabase, `users/${userId}/classes`);

    window.firebaseOnValue(userDataRef, (snapshot) => {
        if (snapshot.exists()) {
            const firebaseData = snapshot.val();

            // Only update if data is different (prevent infinite loop)
            if (JSON.stringify(firebaseData) !== JSON.stringify(classes)) {
                classes = firebaseData;
                localStorage.setItem('classes', JSON.stringify(classes));
                render();
            }
        }
    });
}

// Override save function to also save to Firebase
const originalSave = save;
save = function() {
    originalSave();
    if (currentUser) {
        saveToFirebase(currentUser.uid);
    }
};

// Show user menu
function showUserMenu() {
    const email = currentUser?.email || 'Guest';
    const menuHTML = `
        <div id="userMenu" style="position:fixed; top:80px; right:20px; background:var(--bg-primary); padding:16px; border-radius:12px; box-shadow:var(--shadow-lg); z-index:1000; border:1px solid var(--border); min-width:250px;" onclick="event.stopPropagation()">
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--border);">
                <div style="font-size:0.85em; color:var(--text-secondary);">Signed in as</div>
                <div style="font-weight:600; color:var(--text-primary); margin-top:4px; word-break:break-all;">${email}</div>
            </div>
            <button onclick="signOutUser()" style="width:100%; text-align:left; padding:10px; background:var(--bg-secondary); border:none; border-radius:8px; cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
                <span>🚪</span> Sign Out
            </button>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', menuHTML);

    // Close menu when clicking outside
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