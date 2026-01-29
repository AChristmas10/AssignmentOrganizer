console.log("Script loaded");

let classes = JSON.parse(localStorage.getItem("classes")) || [];

// Migrate old data: convert 'readiness' to 'prepared' if needed
classes.forEach(cls => {
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
    classes.push({ name, assignments: [], tests: [], isOpen: false });
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
    timeInput.value = '';
    render(); save();
}

// UPDATE ASSIGNMENT PROGRESS
function updateAssignmentProgress(classIndex, assignmentIndex, value){
    classes[classIndex].assignments[assignmentIndex].progress = Number(value);
    render(); save();
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
    render(); save();
}

// UPDATE TEST PREPARED
function updateTestPrepared(classIndex, testIndex, value){
    classes[classIndex].tests[testIndex].prepared = Number(value);
    render(); save();
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
                <h2 title="${cls.name}" style="margin:0;">${displayClassName}</h2>
            </div>
            <span class="assignment-count">${uncompletedCount} assignments</span>
        </div>

        <div id="items-container-${classIndex}" style="display:${cls.isOpen ? 'block' : 'none'}; margin-top:10px;">
            <!-- Add Assignment -->
            <div style="margin-bottom:10px;">
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">
                    <input id="a-name-${classIndex}" placeholder="Assignment name" style="flex: 1; min-width: 150px;">
                    <input id="a-due-${classIndex}" type="date" style="width: 140px;">
                    <input id="a-time-${classIndex}" type="time" value="23:59" style="width: 100px;">
                    <button onclick="addAssignment(${classIndex})">Add Assignment</button>
                </div>
                
                <!-- Add Test -->
                <div style="display:flex; gap:4px; align-items:center; flex-wrap:wrap;">
                    <input id="t-name-${classIndex}" placeholder="Test name" style="flex: 1; min-width: 150px;">
                    <input id="t-date-${classIndex}" type="date" style="width: 140px;">
                    <span style="width: 100px;"></span>
                    <button onclick="addTest(${classIndex})">Add Test</button>
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
                <div style="margin-top:6px;">
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
                <div style="margin-top:6px;">
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
                                <span style="background: #e0e0e0; padding: 2px 8px; border-radius: 12px; font-size: 0.8em;">
                                    ${item.className}
                                </span>
                            </div>
                            <span style="font-size:0.85em; color:#555; margin-top: 4px; display: block;">
                                ${formatDate(item.date)}${isAssignment && item.time ? ' at ' + formatTime(item.time) : ''} (${dueInText(item.date)})
                            </span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap: 10px;">
                        <span style="min-width: 80px;">${isAssignment ? 'Progress:' : 'Prepared:'}</span>
                        <input type="range" min="0" max="10" value="${isAssignment ? item.progress : item.prepared}" 
                               oninput="${isAssignment ? 'updateAssignmentProgress' : 'updateTestPrepared'}(${item.classIndex},${item.itemIndex},this.value); renderAllItems();"
                               style="flex: 1;">
                        <span style="min-width: 40px;">${isAssignment ? item.progress : item.prepared}/10</span>
                    </div>
                    ${completed ? `<div class="completed-label">✔ ${isAssignment ? 'Completed' : 'Ready'}</div>` : ''}
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
            
            <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px;">
                <div style="display: flex; gap: 20px; justify-content: center; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: #4CAF50; border-radius: 3px;"></div>
                        <span>Assignment</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: #e67e22; border-radius: 3px;"></div>
                        <span>Test</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 20px; height: 20px; background: #ddd; border-radius: 3px;"></div>
                        <span>Completed</span>
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