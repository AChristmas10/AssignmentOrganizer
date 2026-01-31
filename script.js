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

// ADD ASSIGNMENT
function addAssignment(classIndex){
    const nameInput = document.getElementById(`a-name-${classIndex}`);
    const dueInput = document.getElementById(`a-due-${classIndex}`);
    const timeInput = document.getElementById(`a-time-${classIndex}`);
    if(!nameInput.value || !dueInput.value) return;
    const assignmentName = nameInput.value.trim().slice(0,30);
    const dueTime = timeInput.value || '23:59'; // Default to 11:59 PM
    classes[classIndex].assignments.push({
        name: assignmentName,
        due: dueInput.value,
        time: dueTime,
        progress: 0
    });
    nameInput.value = '';
    dueInput.value = '';
    timeInput.value = '23:59';

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
            <div id="add-assignment-form-${classIndex}" style="display:none; margin-bottom:10px; padding:10px; background:#f9f9f9; border-radius:4px;">
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                    <input id="a-name-${classIndex}" placeholder="Assignment name" style="flex: 1; min-width: 150px;">
                    <input id="a-due-${classIndex}" type="date" style="width: 140px;">
                    <input id="a-time-${classIndex}" type="time" value="23:59" style="width: 100px;">
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="addAssignment(${classIndex})">Save Assignment</button>
                    <button onclick="cancelAddAssignment(${classIndex})" style="background:#ccc;">Cancel</button>
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
                <div class="calendar-item ${item.type} ${completed ? 'completed' : ''}" 
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
                        <div style="width: 20px; height: 20px; background: var(--success); border-radius: 3px;"></div>
                        <span style="color: var(--text-primary);">Assignment</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: var(--warning); border-radius: 3px;"></div>
                        <span style="color: var(--text-primary);">Test</span>
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
})();