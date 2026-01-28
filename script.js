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
    const dueDate = new Date(dueDateStr);

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
    const d = new Date(dueDateStr);
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${mm}/${dd}`;
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
    if(!nameInput.value || !dueInput.value) return;
    const assignmentName = nameInput.value.trim().slice(0,30);
    classes[classIndex].assignments.push({ name:assignmentName, due:dueInput.value, progress:0 });
    nameInput.value = '';
    dueInput.value = '';
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
            <div style="margin-bottom:10px; display:flex; gap:10px; flex-wrap:wrap;">
                <!-- Add Assignment -->
                <div style="display:flex; gap:4px; align-items:center;">
                    <input id="a-name-${classIndex}" placeholder="Assignment name">
                    <input id="a-due-${classIndex}" type="date">
                    <button onclick="addAssignment(${classIndex})">Add Assignment</button>
                </div>

                <!-- Add Test -->
                <div style="display:flex; gap:4px; align-items:center;">
                    <input id="t-name-${classIndex}" placeholder="Test name">
                    <input id="t-date-${classIndex}" type="date">
                    <button onclick="addTest(${classIndex})">Add Test</button>
                </div>
            </div>

            <!-- ASSIGNMENTS SECTION -->
            ${sortedAssignments.length > 0 ? '<h3 style="margin-top:15px; margin-bottom:8px; font-size:1.1em;">Assignments</h3>' : ''}
            ${sortedAssignments.map((a) => {
            const completed = a.progress === 10;
            const displayAssignmentName = a.name.length > 30 ? a.name.slice(0,30) + "…" : a.name;
            return `
            <div class="assignment ${completed ? 'completed' : ''}">
                <div style="display:flex; justify-content: space-between; align-items:center;">
                    <div>
                        <strong title="${a.name}">${displayAssignmentName}</strong>
                        <span style="font-size:0.85em; color:#555; margin-left:8px;">
                            ${formatDate(a.due)} (${dueInText(a.due)})
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