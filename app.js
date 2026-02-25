/**
 * MoveTrainer Pro V2 - Main Application Logic
 * Requires: chess.js and chessground
 */

import { Chessground } from 'https://cdn.jsdelivr.net/npm/chessground@8.3.4/chessground.min.js';
import { storage } from './storage.js';

// Expose to window for better debug and event handlers
window.appStorage = storage;

// --- STATE ---
const state = {
    currentView: 'landing', // Initial view
    activeCourse: null,
    currentCourseId: null, // Track active course ID for marking studied
    mode: 'idle', // 'idle' | 'learn' | 'test'
    currentLineIndex: 0,
    currentMoveIndex: 0,
    chess: new Chess(),
    board: null,
    orientation: 'white',
    trainingDueOnly: false,
    dueQueue: [],
    currentDueIndex: 0,

    // Tree Builder State
    builder: {
        board: null,
        chess: new Chess(),
        root: { moves: {} }, // Variation tree
        history: [], // Current path in the tree
        count: 0
    }
};

// --- DOM ELEMENTS ---
const elements = {
    // Views
    viewDashboard: document.getElementById('view-dashboard'),
    viewAddCourse: document.getElementById('view-add-course'),
    viewCourseDetails: document.getElementById('view-course-details'),
    viewTraining: document.getElementById('view-training'),

    // Nav
    navDashboard: document.getElementById('nav-dashboard'),
    navAddCourse: document.getElementById('nav-add-course'),
    btnBackDashboardCommon: document.querySelectorAll('.btn-back-dashboard-common'),
    btnExitTraining: document.getElementById('btn-exit-training'),

    // Dashboard
    courseGrid: document.getElementById('course-grid'),
    btnStartReview: document.getElementById('btn-start-review'),
    dueCount: document.getElementById('due-count'),
    btnEmptyAdd: document.getElementById('btn-empty-add'),

    // Add Course
    pgnInput: document.getElementById('pgn-input'),
    courseTitle: document.getElementById('course-title'),
    btnImportSave: document.getElementById('btn-import-save'),

    // Course Details
    detailsCourseTitle: document.getElementById('details-course-title'),
    detailsCourseStats: document.getElementById('details-course-stats'),
    detailsLinesList: document.getElementById('details-lines-list'),
    btnDetailsStudy: document.getElementById('btn-details-study'),
    btnDetailsDelete: document.getElementById('btn-details-delete'),

    // Training
    trainingCourseTitle: document.getElementById('training-course-title'),
    btnNextLine: document.getElementById('btn-next-line'),
    btnLichess: document.getElementById('btn-lichess'),
    btnHint: document.getElementById('btn-hint'), // For UX polish later
    movesHistory: document.getElementById('moves-history'),
    trainingStatusBadge: document.getElementById('training-status-badge'),
    lineProgressText: document.getElementById('line-progress-text'),
    lineProgressBar: document.getElementById('line-progress-bar'),
    feedbackPanel: document.getElementById('feedback-panel'),
    feedbackMessage: document.getElementById('feedback-message'),
    feedbackSubtext: document.getElementById('feedback-subtext'),

    // Landing Page
    viewLanding: document.getElementById('view-landing'),
    btnLandingStart: document.getElementById('btn-landing-start'),

    // Tree Builder
    viewBuildRepertoire: document.getElementById('view-build-repertoire'),
    navBuildRepertoire: document.getElementById('nav-build-repertoire'),
    btnBuilderSave: document.getElementById('btn-builder-save'),
    btnBuilderReset: document.getElementById('btn-builder-reset'),
    builderTitle: document.getElementById('builder-title'),
    builderColor: document.getElementById('builder-color'),
    builderVariationsCount: document.getElementById('builder-variations-count'),
    builderMoveList: document.getElementById('builder-move-list'),
    builderBoard: document.getElementById('builder-board'),
};

// --- INITIALIZATION ---
function init() {
    // Initialize Chessground
    state.board = Chessground(document.getElementById('board'), {
        fen: 'start',
        orientation: state.orientation,
        turnColor: 'white',
        movable: {
            color: 'white',
            free: false,
            events: {
                after: handleUserMove
            }
        },
        highlight: { lastMove: true, check: true },
        animation: { enabled: true, duration: 250 },
        premovable: { enabled: false }
    });

    // Initialize Builder Board
    if (elements.builderBoard) {
        state.builder.board = Chessground(elements.builderBoard, {
            fen: 'start',
            movable: {
                color: 'both',
                free: false,
                dests: getChessgroundDests(state.builder.chess),
                events: {
                    after: (orig, dest) => handleBuilderMove(orig, dest)
                }
            },
            highlight: { lastMove: true, check: true },
            animation: { enabled: true, duration: 250 }
        });
    }

    // Initial suggestions for start pos
    fetchBuilderSuggestions();

    // Subscriptions
    elements.navDashboard.addEventListener('click', () => switchView('dashboard'));
    elements.navAddCourse.addEventListener('click', () => switchView('add-course'));
    elements.navBuildRepertoire.addEventListener('click', () => switchView('build-repertoire'));

    elements.btnLandingStart.addEventListener('click', () => {
        switchView('dashboard');
        // Initial dashboard render is handled by switchView
    });

    elements.btnBackDashboardCommon.forEach(btn => btn.addEventListener('click', () => switchView('dashboard')));
    elements.btnExitTraining.addEventListener('click', () => switchView('dashboard'));
    if (elements.btnEmptyAdd) elements.btnEmptyAdd.addEventListener('click', () => switchView('add-course'));

    elements.btnImportSave.addEventListener('click', handleSaveCourse);
    
    // File upload handler
    const btnUploadPgn = document.getElementById('btn-upload-pgn');
    const pgnFileInput = document.getElementById('pgn-file-input');
    if (btnUploadPgn && pgnFileInput) {
        btnUploadPgn.addEventListener('click', () => pgnFileInput.click());
        pgnFileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    elements.pgnInput.value = event.target.result;
                    pgnFileInput.value = ''; // Reset for next upload
                };
                reader.onerror = () => alert('Error reading file');
                reader.readAsText(file);
            }
        });
    }
    
    elements.btnBuilderSave.addEventListener('click', handleSaveBuilderRepertoire);
    elements.btnBuilderReset.addEventListener('click', resetBuilder);
    elements.builderColor.addEventListener('change', (e) => {
        state.builder.board.set({ orientation: e.target.value });
    });

    elements.btnStartReview.addEventListener('click', startDailyReview);
    elements.btnNextLine.addEventListener('click', goToNextLine);
    elements.btnLichess.addEventListener('click', openLichessAnalysis);

    // Initial view
    switchView('landing');
}

// --- VIEW ROUTING ---
function switchView(viewName) {
    state.currentView = viewName;

    // Hide all
    const views = [
        elements.viewLanding,
        elements.viewDashboard,
        elements.viewAddCourse,
        elements.viewCourseDetails,
        elements.viewTraining,
        elements.viewBuildRepertoire
    ];

    views.forEach(v => {
        if (v) {
            v.classList.add('hidden', 'opacity-0');
        }
    });

    // Reset Active Navs
    [elements.navDashboard, elements.navAddCourse, elements.navBuildRepertoire].forEach(nav => {
        if (nav) {
            nav.classList.replace('text-white', 'text-chess-muted');
            nav.classList.replace('bg-slate-800', 'bg-transparent');
        }
    });

    // Handle Sidebar Visibility - Simple toggle for robustness
    const sidebar = document.getElementById('main-sidebar');
    if (sidebar) {
        if (viewName === 'landing') {
            sidebar.classList.add('hidden');
        } else {
            sidebar.classList.remove('hidden');
        }
    }

    setTimeout(() => {
        let currentViewEl = null;
        if (viewName === 'landing') currentViewEl = elements.viewLanding;
        else if (viewName === 'dashboard') {
            currentViewEl = elements.viewDashboard;
            elements.navDashboard.classList.replace('text-chess-muted', 'text-white');
            elements.navDashboard.classList.replace('bg-transparent', 'bg-slate-800');
            renderDashboard();
        } else if (viewName === 'add-course') {
            currentViewEl = elements.viewAddCourse;
            elements.navAddCourse.classList.replace('text-chess-muted', 'text-white');
            elements.navAddCourse.classList.replace('bg-transparent', 'bg-slate-800');
        } else if (viewName === 'course-details') {
            currentViewEl = elements.viewCourseDetails;
        } else if (viewName === 'training') {
            currentViewEl = elements.viewTraining;
        } else if (viewName === 'build-repertoire') {
            currentViewEl = elements.viewBuildRepertoire;
            elements.navBuildRepertoire.classList.replace('text-chess-muted', 'text-white');
            elements.navBuildRepertoire.classList.replace('bg-transparent', 'bg-slate-800');
        }

        if (currentViewEl) {
            currentViewEl.classList.remove('hidden');
            setTimeout(() => {
                currentViewEl.classList.remove('opacity-0');
                // Force board redraws after DOM has laid out
                window.dispatchEvent(new Event('resize'));
                // Explicit chessground redraw for boards that initialized while hidden
                if (state.board) state.board.redrawAll();
                if (state.builder.board) state.builder.board.redrawAll();
            }, 50);
        }
    }, 150);
}

// --- DASHBOARD UI ---
function renderDashboard() {
    const courses = storage.getAllCourses();
    const dueLines = storage.getDueLines();

    elements.dueCount.textContent = dueLines.length;
    elements.btnStartReview.disabled = dueLines.length === 0;

    elements.courseGrid.innerHTML = '';

    if (courses.length === 0) {
        elements.courseGrid.innerHTML = `
            <div class="p-8 border border-slate-700/50 rounded-xl bg-slate-800/50 col-span-full text-center">
                <p class="text-chess-muted mb-4">You haven't added any repertoires yet.</p>
                <button onclick="document.getElementById('nav-add-course').click()" class="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg font-medium transition-colors text-sm">Create First Course</button>
            </div>
        `;
        return;
    }

    courses.forEach(course => {
        // Calculate due for this specific course
        const courseDue = dueLines.filter(l => l.courseId === course.id).length;

        const card = document.createElement('div');
        card.className = "bg-chess-panel border border-slate-700/50 rounded-xl p-5 shadow-lg hover:border-slate-500 transition-colors flex flex-col group cursor-pointer course-card";
        card.setAttribute('data-id', course.id);

        const colorBadge = course.color === 'white'
            ? '<span class="px-2 py-0.5 bg-slate-200 text-slate-800 text-[10px] uppercase font-bold rounded">White</span>'
            : '<span class="px-2 py-0.5 bg-slate-800 text-slate-200 text-[10px] uppercase font-bold rounded border border-slate-700">Black</span>';

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3 relative">
                ${colorBadge}
                <button class="btn-delete-course absolute top-0 right-0 w-8 h-8 flex items-center justify-center p-0 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-all z-50 cursor-pointer" data-id="${course.id}" title="Delete Course" style="pointer-events: auto !important;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
            <h3 class="text-lg font-bold text-white mb-1 truncate">${course.title}</h3>
            <p class="text-sm text-chess-muted mb-4">${course.lines.length} variations</p>
            
            <div class="mt-auto pt-4 border-t border-slate-700/50 flex justify-between items-center group-hover:border-slate-500">
                <div class="text-xs font-medium ${courseDue > 0 ? 'text-blue-400' : 'text-slate-500'}">
                    ${courseDue > 0 ? courseDue + ' Due Reviews' : 'Up to date'}
                </div>
                <div class="text-chess-accent text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                    Details
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>
        `;

        elements.courseGrid.appendChild(card);
    });

    // Make entire card clickable to see details
    document.querySelectorAll('.course-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-course')) return; // Ignore if clicking delete
            const id = e.currentTarget.getAttribute('data-id');
            showCourseDetails(id);
        });
    });

    // Attach deletion handlers for dashboard quick-delete
    const deleteButtons = document.querySelectorAll('.btn-delete-course');
    console.log(`Attached delete listeners to ${deleteButtons.length} buttons`);

    deleteButtons.forEach(btn => {
        btn.onclick = function (e) {
            console.log("Dashboard delete clicked", this.getAttribute('data-id'));
            e.stopPropagation();
            e.preventDefault();
            const id = this.getAttribute('data-id');
            if (confirm("Are you sure you want to completely delete this repertoire?")) {
                storage.deleteCourse(id);
                renderDashboard();
            }
        };
    });
}

// --- COURSE DETAILS ---
function showCourseDetails(courseId) {
    const course = storage.getCourse(courseId);
    if (!course) return;

    elements.detailsCourseTitle.textContent = course.title;
    elements.detailsCourseStats.textContent = `${course.lines.length} variations • ${course.color === 'white' ? 'White' : 'Black'} Repertoire`;

    elements.detailsLinesList.innerHTML = '';

    course.lines.forEach((line, index) => {
        const lineEl = document.createElement('div');
        lineEl.className = "bg-slate-900/50 rounded-lg p-3 text-sm font-mono text-chess-muted overflow-x-auto border border-transparent hover:border-slate-600 transition-colors cursor-pointer group";
        
        // Status badge colors
        let statusBadge = '';
        let statusColor = 'bg-slate-700 text-slate-300';
        let statusLabel = 'Not Studied';
        
        if (line.status === 'mastered') {
            statusColor = 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/50';
            statusLabel = '✓ Mastered';
        } else if (line.status === 'studied') {
            statusColor = 'bg-blue-900/40 text-blue-300 border border-blue-700/50';
            statusLabel = '✓ Studied';
        }
        
        statusBadge = `<span class="inline-block ${statusColor} px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap">${statusLabel}</span>`;

        let sanPresentation = '';
        let currentPair = [];
        line.sanSequence.forEach(san => {
            currentPair.push(san);
            if (currentPair.length === 2) {
                sanPresentation += `<span class="mr-2">${currentPair[0]} ${currentPair[1]}</span>`;
                currentPair = [];
            }
        });
        if (currentPair.length === 1) {
            sanPresentation += `<span>${currentPair[0]}</span>`;
        }

        lineEl.innerHTML = `
            <div class="flex items-center gap-3 justify-between">
                <div class="flex items-center gap-3 flex-1 min-w-0">
                    <span class="text-slate-600 font-bold select-none min-w-[20px] text-right">#${index + 1}</span>
                    <div class="flex-grow overflow-hidden">${sanPresentation}</div>
                </div>
                <div class="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    ${statusBadge}
                </div>
            </div>
        `;
        
        lineEl.addEventListener('click', () => {
            startCourseTraining(courseId, index);
        });
        
        elements.detailsLinesList.appendChild(lineEl);
    });

    // Clear old listeners by cloning
    const newBtnStudy = elements.btnDetailsStudy.cloneNode(true);
    elements.btnDetailsStudy.parentNode.replaceChild(newBtnStudy, elements.btnDetailsStudy);
    elements.btnDetailsStudy = newBtnStudy;

    const newBtnDelete = elements.btnDetailsDelete.cloneNode(true);
    elements.btnDetailsDelete.parentNode.replaceChild(newBtnDelete, elements.btnDetailsDelete);
    elements.btnDetailsDelete = newBtnDelete;

    elements.btnDetailsStudy.addEventListener('click', () => {
        console.log("Details study clicked", course.id);
        startCourseTraining(courseId);
    });

    elements.btnDetailsDelete.addEventListener('click', (e) => {
        console.log("Details delete clicked", course.id);
        e.preventDefault();
        if (confirm("Are you sure you want to completely delete this repertoire?")) {
            storage.deleteCourse(course.id);
            switchView('dashboard');
            renderDashboard();
        }
    });

    switchView('course-details');
}

// --- COURSE CREATION ---
function handleSaveCourse() {
    const rawPgn = elements.pgnInput.value.trim();
    const title = elements.courseTitle.value.trim() || 'Untitled Repertoire';

    if (!rawPgn) {
        alert('Please enter some PGN data.');
        return;
    }

    try {
        console.log('===== PGN IMPORT DEBUG ====');
        console.log('Raw PGN length:', rawPgn.length);
        const lines = extractVariationsFromPGN(rawPgn);
        console.log('Parsed variations:', lines.length);
        lines.slice(0, 10).forEach((line, i) => {
            console.log(`Variation ${i + 1}:`, line.map(m => m.san).join(' '));
        });
        console.log('========================');
        
        if (lines.length === 0) {
            alert('No standard moves found in PGN. Check that moves are in algebraic notation (e.g., e4, Nf3, etc.)\n\nOpen browser console (F12) for debug info.');
            return;
        }

        // Infer color based on first move
        let color = 'white'; // default
        // In a real app we'd let them pick, but let's stick to default white for now 
        // unless they specify in the UI (which we can add later).

        storage.saveCourse(title, color, lines);

        // Reset form
        elements.pgnInput.value = '';
        elements.courseTitle.value = '';

        // Success feedback
        showFeedback(`Successfully imported ${lines.length} variations!`, '', 'success');

        // Go back
        setTimeout(() => switchView('dashboard'), 500);

    } catch (e) {
        console.error('PGN Parse Error:', e);
        alert('Error parsing PGN. Check format. ' + e.message + '\n\nOpen browser console (F12) for details.');
    }
}

// --- TRAINING LOGIC ---

function startCourseTraining(courseId, startLineIndex = 0) {
    state.activeCourse = storage.getCourse(courseId);
    state.trainingDueOnly = false;
    state.orientation = state.activeCourse.color;
    state.currentCourseId = courseId; // Store for later use

    elements.trainingCourseTitle.textContent = state.activeCourse.title;
    switchView('training');
    startLine(startLineIndex);
}

function startDailyReview() {
    state.dueQueue = storage.getDueLines();
    if (state.dueQueue.length === 0) return;

    state.trainingDueOnly = true;
    state.currentDueIndex = 0;

    // We update orientation dynamically per line in SRS mode
    const firstDue = state.dueQueue[0];
    state.orientation = firstDue.courseColor;
    state.currentCourseId = firstDue.courseId; // Track the course ID

    // Create a mock active course just for this line temporarily
    state.activeCourse = {
        title: "Daily Review",
        lines: [firstDue]
    };

    elements.trainingCourseTitle.textContent = "Daily Review (" + state.dueQueue.length + " lines)";
    switchView('training');
    startLine(0);
}

function startLine(lineIndex) {
    if (lineIndex < 0 || lineIndex >= state.activeCourse.lines.length) return;

    state.currentLineIndex = lineIndex;
    state.currentMoveIndex = 0;
    state.mode = 'learn'; // Always start with learn mode

    state.chess.reset();
    updateBoardUI();

    elements.btnNextLine.disabled = state.trainingDueOnly
        ? state.currentDueIndex >= state.dueQueue.length - 1
        : lineIndex >= state.activeCourse.lines.length - 1;

    updateProgressUI();
    updateModeBadge();
    renderMovesHistory();

    showFeedback('Learn Mode', 'Follow the arrows to learn the line.', 'info');
    processNextMove();
}

function processNextMove() {
    const currentLine = state.activeCourse.lines[state.currentLineIndex];

    if (state.currentMoveIndex >= currentLine.sanSequence.length) {
        handleLineComplete();
        return;
    }

    const sanToPlay = currentLine.sanSequence[state.currentMoveIndex];

    // We must find out whose turn it is
    // The easiest way is to check the FEN, but chess.turn() tells us ('w' or 'b')
    const isUserTurn = state.chess.turn() === state.orientation.charAt(0);

    if (!isUserTurn) {
        // Opponent's turn
        setTimeout(() => {
            state.chess.move(sanToPlay);
            state.currentMoveIndex++;
            updateBoardUI();

            // Audio cue here

            renderMovesHistory();
            processNextMove();
        }, 600);

        // Lock board
        state.board.set({ movable: { color: undefined } });
    } else {
        // User's turn
        updateBoardUI();

        // Find the raw move object to get the origin and dest for arrows
        const tempChess = new Chess(state.chess.fen());
        const moveObj = tempChess.move(sanToPlay);

        if (state.mode === 'learn') {
            // Draw arrow
            state.board.setShapes([{ orig: moveObj.from, dest: moveObj.to, brush: 'green' }]);
        } else if (state.mode === 'test') {
            // Remove arrows
            state.board.setShapes([]);
        }

        // Unlock Board for User
        state.board.set({
            movable: {
                color: state.orientation,
                dests: getValidMoves(),
            }
        });

        scrollToCurrentMove();
    }
}

function handleUserMove(orig, dest) {
    const currentLine = state.activeCourse.lines[state.currentLineIndex];
    const expectedSan = currentLine.sanSequence[state.currentMoveIndex];

    // Generate what the user actually played
    const tempChess = new Chess(state.chess.fen());
    const attemptedMove = tempChess.move({ from: orig, to: dest, promotion: 'q' }); // Assume queen promo for simple MVP

    if (!attemptedMove) {
        // Should not happen if dests are correct, but snapback
        updateBoardUI();
        return;
    }

    if (attemptedMove.san === expectedSan) {
        // Correct Move!
        state.chess.move(attemptedMove.san);
        state.currentMoveIndex++;
        state.board.setShapes([]); // clear arrows
        updateBoardUI();
        renderMovesHistory();

        // Proceed to opponent or next line
        processNextMove();
    } else {
        // Incorrect Move (Test Mode Failure)

        // Snapback mechanism
        updateBoardUI();

        // Visual feedback
        state.board.setShapes([{ orig: orig, dest: dest, brush: 'red' }]);
        document.getElementById('board').classList.add('shake');
        setTimeout(() => document.getElementById('board').classList.remove('shake'), 400);

        showFeedback('Incorrect Move', 'Try again or review the line.', 'error');

        if (state.mode === 'test') {
            // Future feature: Record a 'Hard' or 'Again' score here for SRS if they fail.
            // For now, let's reset to start of Test mode or Learn mode.
            // A simple strategy is just to enforce they keep trying.
        }

        // Re-open board for another attempt
        state.board.set({
            movable: {
                color: state.orientation,
                dests: getValidMoves(),
            }
        });
    }
}

function handleLineComplete() {
    if (state.mode === 'learn') {
        showFeedback('Learn Complete', 'Now try from memory!', 'success');
        setTimeout(() => {
            state.mode = 'test';
            state.currentMoveIndex = 0;
            state.chess.reset();
            updateBoardUI();
            updateModeBadge();
            renderMovesHistory();
            processNextMove();
        }, 1500);
    } else {
        showFeedback('Line Mastered!', 'Excellent memory.', 'success');

        // Get the current line being studied
        const currentLine = state.activeCourse.lines[state.currentLineIndex];
        
        // Auto-mark as studied when both learn and test are completed
        if (state.currentCourseId && currentLine && currentLine.id) {
            try {
                if (typeof storage.updateLineStatus === 'function') {
                    storage.updateLineStatus(state.currentCourseId, currentLine.id, 'studied');
                    console.log('Line marked as studied:', currentLine.id);
                } else {
                    console.warn('updateLineStatus not available', storage);
                }
            } catch (e) {
                console.error('Error marking line as studied:', e);
            }
        }

        // SRS Processing
        if (state.trainingDueOnly) {
            const completedLine = state.dueQueue[state.currentDueIndex];
            // Grade 4 for good performance
            storage.processReview(completedLine.courseId, completedLine.id, 4);
        } else {
            // Also process standard course progression as a Good grade if it was due or just learning
            storage.processReview(state.currentCourseId, currentLine.id, 4);
        }

        setTimeout(() => {
            goToNextLine();
        }, 1500);
    }
}

function goToNextLine() {
    if (state.trainingDueOnly) {
        if (state.currentDueIndex < state.dueQueue.length - 1) {
            state.currentDueIndex++;

            // Re-setup the mock active course
            const nextDue = state.dueQueue[state.currentDueIndex];
            state.orientation = nextDue.courseColor;
            state.currentCourseId = nextDue.courseId; // Track the course ID
            state.activeCourse = { title: "Daily Review", lines: [nextDue] };

            startLine(0);
        } else {
            showFeedback('Review Complete!', 'You have finished your daily reviews.', 'success');
            setTimeout(() => switchView('dashboard'), 2000);
        }
    } else {
        if (state.currentLineIndex < state.activeCourse.lines.length - 1) {
            startLine(state.currentLineIndex + 1);
        } else {
            showFeedback('Course Complete!', 'You have mastered this repertoire.', 'success');
            setTimeout(() => switchView('dashboard'), 2000);
        }
    }
}

function openLichessAnalysis() {
    const fen = state.chess.fen();
    const fenEncoded = encodeURIComponent(fen);
    const colorStr = state.orientation;
    const url = `https://lichess.org/analysis/standard/${fenEncoded}?color=${colorStr}`;
    window.open(url, '_blank');
}
// --- UTILS & UI UPDATERS ---

function getChessgroundDests(chess) {
    const dests = new Map();
    chess.SQUARES.forEach(s => {
        const ms = chess.moves({ square: s, verbose: true });
        if (ms.length > 0) dests.set(s, ms.map(m => m.to));
    });
    return dests;
}

function updateBoardUI() {
    state.board.set({
        fen: state.chess.fen(),
        orientation: state.orientation,
        turnColor: state.chess.turn() === 'w' ? 'white' : 'black',
        lastMove: state.chess.history({ verbose: true }).length > 0
            ? [state.chess.history({ verbose: true }).pop().from, state.chess.history({ verbose: true }).pop().to]
            : []
    });
}

function getValidMoves() {
    const dests = new Map();
    state.chess.SQUARES.forEach(s => {
        const ms = state.chess.moves({ square: s, verbose: true });
        if (ms.length) dests.set(s, ms.map(m => m.to));
    });
    return dests;
}

function renderMovesHistory() {
    const currentLine = state.activeCourse.lines[state.currentLineIndex];
    elements.movesHistory.innerHTML = '';

    let tempChess = new Chess();
    let movePairs = [];
    let currentPair = [];

    // Bundle them in pairs (White, Black) for display
    currentLine.sanSequence.forEach((san, index) => {
        currentPair.push({ san: san, index: index });
        if (currentPair.length === 2) {
            movePairs.push(currentPair);
            currentPair = [];
        }
    });
    if (currentPair.length > 0) movePairs.push(currentPair);

    // Build DOM
    movePairs.forEach((pair, turnIndex) => {
        const turnDiv = document.createElement('div');
        turnDiv.className = 'w-full flex items-baseline gap-2 py-0.5';

        const numSpan = document.createElement('span');
        numSpan.className = 'text-slate-500 w-6 text-right';
        numSpan.textContent = `${turnIndex + 1}.`;
        turnDiv.appendChild(numSpan);

        pair.forEach(moveData => {
            const mSpan = document.createElement('span');
            mSpan.className = 'w-12 text-left transition-colors duration-200';
            mSpan.textContent = moveData.san;

            // Highlighting logic
            if (moveData.index < state.currentMoveIndex) {
                mSpan.classList.add('text-chess-muted'); // Played
            } else if (moveData.index === state.currentMoveIndex) {
                mSpan.classList.add('text-white', 'font-bold', 'bg-slate-700', 'px-1', 'rounded'); // Current target
            } else {
                if (state.mode === 'test') {
                    mSpan.textContent = '...'; // Blur future in test mode
                    mSpan.classList.add('text-slate-600');
                } else {
                    mSpan.classList.add('text-slate-600'); // Future
                }
            }

            turnDiv.appendChild(mSpan);
        });

        elements.movesHistory.appendChild(turnDiv);
    });
}

function scrollToCurrentMove() {
    const activeMove = elements.movesHistory.querySelector('.font-bold');
    if (activeMove) {
        activeMove.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function updateProgressUI() {
    const total = state.trainingDueOnly ? state.dueQueue.length : state.activeCourse.lines.length;
    const current = (state.trainingDueOnly ? state.currentDueIndex : state.currentLineIndex) + 1;

    elements.lineProgressText.textContent = `${current} / ${total}`;
    const pct = (current / total) * 100;
    elements.lineProgressBar.style.width = `${pct}%`;
}

function updateModeBadge() {
    elements.trainingStatusBadge.textContent = state.mode.toUpperCase();
    if (state.mode === 'learn') {
        elements.trainingStatusBadge.className = 'text-[10px] font-bold uppercase tracking-wide bg-blue-900/50 text-blue-300 border border-blue-800/50 px-2 py-1 rounded whitespace-nowrap';
    } else {
        elements.trainingStatusBadge.className = 'text-[10px] font-bold uppercase tracking-wide bg-purple-900/50 text-purple-300 border border-purple-800/50 px-2 py-1 rounded whitespace-nowrap';
    }
}

function showFeedback(title, subtext, type = 'info') {
    elements.feedbackMessage.textContent = title;
    elements.feedbackSubtext.textContent = subtext;

    elements.feedbackPanel.classList.remove('opacity-0', 'translate-y-4');

    if (type === 'error') {
        elements.feedbackMessage.classList.replace('text-chess-accent', 'text-red-400');
        elements.feedbackMessage.classList.replace('text-chess-success', 'text-red-400');
    } else if (type === 'success') {
        elements.feedbackMessage.classList.replace('text-chess-accent', 'text-chess-success');
        elements.feedbackMessage.classList.replace('text-red-400', 'text-chess-success');
    } else {
        // info
        elements.feedbackMessage.classList.replace('text-red-400', 'text-chess-accent');
        elements.feedbackMessage.classList.replace('text-chess-success', 'text-chess-accent');
    }

    // Clear old timeouts
    if (window.feedbackTimeout) clearTimeout(window.feedbackTimeout);

    // Hide after 3 seconds unless it's an error and they are in test mode (keep visible longer)
    window.feedbackTimeout = setTimeout(() => {
        elements.feedbackPanel.classList.add('opacity-0', 'translate-y-4');
    }, 3000);
}

// --- PGN PARSING UTILS (From V1) ---

function extractVariationsFromPGN(pgnString) {
    // Split by blank lines to handle multiple games
    const games = pgnString.split(/\n\s*\n/);
    let allLines = [];

    for (const game of games) {
        const lines = parseSingleGame(game);
        allLines = allLines.concat(lines);
    }

    // Remove exact duplicates
    const seenSignatures = new Set();
    const uniqueLines = [];
    
    for (const line of allLines) {
        const sig = line.map(m => m.san).join(' ');
        if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            uniqueLines.push(line);
        }
    }

    return uniqueLines;
}

function parseSingleGame(pgnString) {
    // Remove headers/metadata
    let body = pgnString.replace(/\[.*?\]\s*/g, '').trim();
    
    // Remove comments
    body = body.replace(/\{.*?\}/g, '');
    
    // Remove annotations like $1, $2, etc
    body = body.replace(/\$[0-9]+/g, '');
    
    // Remove ! and ? (they're not part of actual move notation)
    body = body.replace(/[?!]+/g, '');

    // Normalize spacing around parentheses
    let spacedBody = body.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').trim();
    
    // Tokenize
    const rawTokens = spacedBody.split(/\s+/).filter(t => t.length > 0);
    
    // Filter out move numbers (e.g. '1.', '2.', '10.')
    // But keep moves that look like 'a4', 'e4', 'Nf3', 'O-O', etc.
    const tokens = rawTokens.filter(t => {
        // Skip move numbers with dots
        if (/^\d+\.+$/.test(t)) return false;
        // Skip game end markers
        if (['1-0', '0-1', '1/2-1/2', '*'].includes(t)) return false;
        return true;
    });

    const results = [];

    function explore(tokensList, basePath) {
        let currentPath = [...basePath];
        let i = 0;

        while (i < tokensList.length) {
            const token = tokensList[i];

            if (token === '(') {
                // Found a variation - branch point is at the position before the last move
                const variationBranchPoint = currentPath.slice(0, currentPath.length - 1);
                let variationEnd = findClosingParens(tokensList, i);
                if (variationEnd !== -1) {
                    const variationTokens = tokensList.slice(i + 1, variationEnd);
                    // Recursively explore the variation
                    explore(variationTokens, variationBranchPoint);
                    i = variationEnd + 1;
                } else {
                    i++;
                }
            } else if (token === ')') {
                i++;
            } else {
                currentPath.push(token);
                i++;
            }
        }

        // Record this line if it has moves
        if (currentPath.length > 0) {
            results.push([...currentPath]);
        }
    }

    function findClosingParens(list, openIndex) {
        let depth = 1;
        for (let j = openIndex + 1; j < list.length; j++) {
            if (list[j] === '(') depth++;
            if (list[j] === ')') depth--;
            if (depth === 0) return j;
        }
        return -1;
    }

    explore(tokens, []);

    // Validate and convert to move objects
    const validLines = [];
    let invalidCount = 0;

    for (let idx = 0; idx < results.length; idx++) {
        const rawMoveSequence = results[idx];
        const c = new Chess();
        const lineVars = [];
        let validLine = true;
        let failedAt = null;

        for (const moveStr of rawMoveSequence) {
            try {
                const moveObj = c.move(moveStr, { sloppy: true }); // sloppy=true allows more formats
                if (moveObj) {
                    lineVars.push(moveObj);
                } else {
                    // Invalid move - skip this line
                    validLine = false;
                    failedAt = moveStr;
                    break;
                }
            } catch (e) {
                validLine = false;
                failedAt = moveStr;
                break;
            }
        }

        if (validLine && lineVars.length > 0) {
            validLines.push(lineVars);
        } else if (rawMoveSequence.length > 0) {
            invalidCount++;
            if (invalidCount <= 3) {
                console.warn(`Variation ${idx + 1} invalid at move "${failedAt}":`, rawMoveSequence.join(' '));
            }
        }
    }

    if (invalidCount > 3) {
        console.warn(`... and ${invalidCount - 3} more invalid variations`);
    }

    return validLines;
}

// --- REPERTOIRE BUILDER (Tree Builder) ---

function resetBuilder() {
    state.builder.chess = new Chess();
    state.builder.root = { moves: {} };
    state.builder.history = [];
    state.builder.count = 0;

    // Reset Board
    state.builder.board.set({
        fen: 'start',
        movable: { dests: getChessgroundDests(state.builder.chess) }
    });

    elements.builderVariationsCount.textContent = '0';
    elements.builderMoveList.innerHTML = '<span class="italic text-slate-600">Start with 1. e4...</span>';

    fetchBuilderSuggestions();
}

function handleBuilderMove(orig, dest) {
    const move = state.builder.chess.move({ from: orig, to: dest, promotion: 'q' });

    if (!move) {
        updateBuilderBoard(); // Snap back
        return;
    }

    // Add to tree
    let current = state.builder.root;
    state.builder.history.forEach(san => {
        current = current.moves[san];
    });

    if (!current.moves[move.san]) {
        current.moves[move.san] = {
            san: move.san,
            moves: {}
        };
    }

    state.builder.history.push(move.san);

    // Update State & UI
    const variations = extractVariationsFromTree(state.builder.root);
    state.builder.count = variations.length;
    elements.builderVariationsCount.textContent = state.builder.count;

    updateBuilderBoard();
    renderBuilderMoveList();
    fetchBuilderSuggestions();
}

/**
 * Keeps the board in sync with the chess engine and legal moves.
 */
function updateBuilderBoard() {
    state.builder.board.set({
        fen: state.builder.chess.fen(),
        movable: { dests: getChessgroundDests(state.builder.chess) }
    });
}

function renderBuilderMoveList() {
    elements.builderMoveList.innerHTML = '';
    state.builder.history.forEach((san, idx) => {
        const span = document.createElement('span');
        span.className = "px-2 py-1 bg-slate-800 rounded text-blue-400 cursor-pointer hover:bg-slate-700 transition-colors border border-slate-700/30 font-medium text-xs";
        span.textContent = `${idx + 1}. ${san}`;
        span.onclick = () => jumpToBuilderStep(idx);
        elements.builderMoveList.appendChild(span);
    });

    if (state.builder.history.length === 0) {
        elements.builderMoveList.innerHTML = '<span class="italic text-slate-600">Start with 1. e4...</span>';
    }
}

function jumpToBuilderStep(index) {
    const newHistory = state.builder.history.slice(0, index + 1);
    state.builder.chess = new Chess();
    newHistory.forEach(san => state.builder.chess.move(san));
    state.builder.history = newHistory;

    updateBuilderBoard();
    renderBuilderMoveList();
    fetchBuilderSuggestions();
}

/**
 * Lichess Suggestions Integration
 */
const lichessCache = new Map();
let fetchTimeout = null;
let retryDelay = 5000; // Exponential backoff starting at 5s

async function fetchBuilderSuggestions() {
    const fen = state.builder.chess.fen();
    const suggestionsContainer = document.getElementById('builder-suggestions');
    if (!suggestionsContainer) return;

    suggestionsContainer.innerHTML = '<div class="text-[10px] text-slate-500 p-6 text-center italic font-medium uppercase tracking-widest">Consulting Lichess Database...</div>';

    // Check cache first
    if (lichessCache.has(fen)) {
        const cachedData = lichessCache.get(fen);
        const colorToMove = fen.split(' ')[1] === 'w' ? 'white' : 'black';
        renderSuggestions(cachedData.moves || [], colorToMove);
        return;
    }

    // Clear existing timeout to debounce
    if (fetchTimeout) {
        clearTimeout(fetchTimeout);
    }

    // Debounce the actual fetch by 600ms to avoid burning API rate limits
    fetchTimeout = setTimeout(async () => {
        try {
            const response = await fetch(`https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fen)}&moves=8`);

            if (response.status === 429) {
                const waitSec = Math.round(retryDelay / 1000);
                suggestionsContainer.innerHTML = `<div class="text-[10px] text-amber-500/80 p-6 text-center italic font-medium uppercase tracking-widest">Lichess Rate Limit hit. <br>Retrying in ${waitSec}s...</div>`;
                // Exponential backoff retry
                setTimeout(() => fetchBuilderSuggestions(), retryDelay);
                retryDelay = Math.min(retryDelay * 2, 60000); // Cap at 60s
                return;
            }

            if (!response.ok) throw new Error('API Error');

            const data = await response.json();

            // Limit cache size to prevent memory leaks
            if (lichessCache.size > 50) {
                const firstKey = lichessCache.keys().next().value;
                lichessCache.delete(firstKey);
            }
            lichessCache.set(fen, data);

            // Determine whose turn it is from the FEN
            const colorToMove = fen.split(' ')[1] === 'w' ? 'white' : 'black';
            renderSuggestions(data.moves || [], colorToMove);
        } catch (err) {
            suggestionsContainer.innerHTML = '<div class="text-[10px] text-red-500/60 p-6 text-center italic font-medium uppercase tracking-widest">Unable to load suggestions. <br>Please verify your connection.</div>';
        }
    }, 400); // 400ms debounce
}

function renderSuggestions(moves, colorToMove) {
    const container = document.getElementById('builder-suggestions');
    if (!container) return;

    if (moves.length === 0) {
        container.innerHTML = '<div class="text-slate-600 text-[10px] text-center py-10 italic uppercase font-bold tracking-widest px-4">End of Master Theory for this line.</div>';
        return;
    }

    // Determine the "best" move by raw winrate for the current color
    let bestMoveIndex = 0;
    let highestWinRate = 0;

    moves.forEach((m, idx) => {
        const total = Math.max(1, m.white + m.draws + m.black);
        const winRate = colorToMove === 'white' ? (m.white / total) : (m.black / total);
        if (winRate > highestWinRate) {
            highestWinRate = winRate;
            bestMoveIndex = idx;
        }
    });

    const totalGamesInPosition = moves.reduce((sum, m) => sum + m.white + m.draws + m.black, 0);

    container.innerHTML = moves.map((m, idx) => {
        // Ensure properties exist, default to 0
        const mWhite = m.white || 0;
        const mDraws = m.draws || 0;
        const mBlack = m.black || 0;

        const total = mWhite + mDraws + mBlack;
        const sum = Math.max(1, total);
        const w = Math.round((mWhite / sum) * 100);
        const d = Math.round((mDraws / sum) * 100);
        const b = Math.round((mBlack / sum) * 100);

        const winRateForMover = colorToMove === 'white' ? w : b;
        const frequency = total / Math.max(1, totalGamesInPosition);

        // Chessbook heuristics
        let badgeHtml = '';
        if (idx === bestMoveIndex && frequency > 0.05) {
            badgeHtml = `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-400 uppercase border border-emerald-500/30 ml-2">Best Move</span>`;
        } else if (frequency > 0.10 && winRateForMover < 25) {
            badgeHtml = `<span class="px-2 py-0.5 rounded bg-red-500/20 text-[10px] font-bold text-red-400 uppercase border border-red-500/30 ml-2">Common Mistake</span>`;
        } else if ((w + b) > 85 && frequency > 0.05) {
            badgeHtml = `<span class="px-2 py-0.5 rounded bg-orange-500/20 text-[10px] font-bold text-orange-400 uppercase border border-orange-500/30 ml-2">Sharp Line</span>`;
        }

        return `
            <button class="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-slate-800 transition-all border border-transparent hover:border-slate-700/50 group text-left"
                    onclick="window.builderPlayMove('${m.san}')">
                <div class="flex flex-col">
                    <div class="flex items-center">
                        <span class="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">${m.san}</span>
                        ${badgeHtml}
                    </div>
                    <span class="text-[10px] text-slate-500 font-mono mt-1">${total.toLocaleString()} games</span>
                </div>
                <div class="flex flex-col items-end gap-1 shrink-0 ml-2">
                    <div class="flex h-1.5 w-24 bg-slate-950 rounded-full overflow-hidden shadow-inner">
                        <div class="bg-blue-500" style="width: ${w}%"></div>
                        <div class="bg-slate-500" style="width: ${d}%"></div>
                        <div class="bg-slate-800" style="width: ${b}%"></div>
                    </div>
                    <span class="text-[9px] text-slate-600 font-bold uppercase tracking-wider">${w}% W / ${d}% D</span>
                </div>
            </button>
        `;
    }).join('');
}

// Global hook for suggestion interaction
window.builderPlayMove = (san) => {
    // Current node in tree
    let current = state.builder.root;
    state.builder.history.forEach(s => {
        current = current.moves[s];
    });

    const move = state.builder.chess.move(san);
    if (!move) return;

    if (!current.moves[move.san]) {
        current.moves[move.san] = { san: move.san, moves: {} };
    }

    state.builder.history.push(move.san);

    // Update Count
    const variations = extractVariationsFromTree(state.builder.root);
    state.builder.count = variations.length;
    elements.builderVariationsCount.textContent = state.builder.count;

    updateBuilderBoard();
    renderBuilderMoveList();
    fetchBuilderSuggestions();
};

/**
 * Recursively extracts all lines from the move tree.
 */
function extractVariationsFromTree(node, currentPath = []) {
    const variations = [];
    const moveSans = Object.keys(node.moves);

    if (moveSans.length === 0) {
        if (currentPath.length > 0) variations.push([...currentPath]);
        return variations;
    }

    moveSans.forEach(san => {
        const branches = extractVariationsFromTree(node.moves[san], [...currentPath, san]);
        variations.push(...branches);
    });

    return variations;
}

function handleSaveBuilderRepertoire() {
    const title = elements.builderTitle.value.trim() || "Built Repertoire";
    const color = elements.builderColor.value;
    const treeVariations = extractVariationsFromTree(state.builder.root);

    if (treeVariations.length === 0) {
        alert("Please make some moves before saving!");
        return;
    }

    // Convert SAN lists to Move Objects
    const parsedLines = [];
    treeVariations.forEach(sanList => {
        const c = new Chess();
        const line = [];
        for (const san of sanList) {
            const m = c.move(san);
            if (m) line.push(m);
        }
        if (line.length > 0) parsedLines.push(line);
    });

    storage.saveCourse(title, color, parsedLines);
    switchView('dashboard');
    alert(`Successfully saved "${title}" with ${parsedLines.length} variations!`);
}

// Bootstrap
document.addEventListener('DOMContentLoaded', init);
