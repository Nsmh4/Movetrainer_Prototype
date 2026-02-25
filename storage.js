/**
 * MoveTrainer Pro - Storage Layer
 * Handles persistence of Courses, Variations, and Spaced Repetition (SRS) data via LocalStorage.
 */

const STORAGE_KEY = 'movetrainer_pro_courses';

/**
 * SRS SM-2 Variant Constants
 */
const SRS_GRADES = {
    AGAIN: 1, // Completely forgot / wrong move
    HARD: 3,  // Remembered, but with hints / struggled
    GOOD: 4,  // Remembered correctly
    EASY: 5   // Remembered perfectly and instantly
};

// INITIALIZATION
if (!localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
} else {
    // Migration: Ensure all lines have a status field
    const courses = JSON.parse(localStorage.getItem(STORAGE_KEY));
    let needsSave = false;
    
    courses.forEach(course => {
        if (course.lines) {
            course.lines.forEach(line => {
                if (!line.hasOwnProperty('status')) {
                    line.status = 'not-studied';
                    needsSave = true;
                }
            });
        }
    });
    
    if (needsSave) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
    }
}

export const storage = {

    // --- COURSE CRUD ---

    getAllCourses() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY));
    },

    getCourse(courseId) {
        const courses = this.getAllCourses();
        return courses.find(c => c.id === courseId);
    },

    saveCourse(title, color, parsedLines) {
        const courses = this.getAllCourses();

        const newCourse = {
            id: 'course_' + Date.now().toString(),
            title: title || 'Untitled Repertoire',
            color: color || 'white', // The side the user plays
            lines: parsedLines.map((lineVars, idx) => ({
                id: 'line_' + Date.now().toString() + '_' + idx,
                sanSequence: lineVars.map(m => m.san),
                // Study Status
                status: 'not-studied', // 'not-studied' | 'studied' | 'mastered'
                // SRS Data
                repetitions: 0,
                interval: 0,
                easeFactor: 2.5,
                nextReviewDate: null // Null indicates never studied
            }))
        };

        courses.push(newCourse);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
        return newCourse;
    },

    deleteCourse(courseId) {
        let courses = this.getAllCourses();
        courses = courses.filter(c => c.id !== courseId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
    },


    // --- SRS LOGIC ---

    /**
     * Retrieves all lines across all courses that are due for review.
     */
    getDueLines() {
        const courses = this.getAllCourses();
        const now = Date.now();
        const dueLines = [];

        courses.forEach(course => {
            course.lines.forEach(line => {
                // Modified: Qualified means nextReviewDate is set (not null)
                if (line.nextReviewDate !== null && line.nextReviewDate <= now) {
                    dueLines.push({
                        courseId: course.id,
                        courseTitle: course.title,
                        courseColor: course.color,
                        ...line
                    });
                }
            });
        });

        // Sort by most overdue first
        return dueLines.sort((a, b) => a.nextReviewDate - b.nextReviewDate);
    },

    /**
     * Updates a line's SRS data based on user performance.
     * Grade: 1 (Agian), 3 (Hard), 4 (Good), 5 (Easy)
     */
    processReview(courseId, lineId, grade) {
        const courses = this.getAllCourses();
        const course = courses.find(c => c.id === courseId);
        if (!course) return;

        const line = course.lines.find(l => l.id === lineId);
        if (!line) return;

        // SM-2 Algorithm variant
        if (grade >= 3) {
            // Correct answer
            if (line.repetitions === 0) {
                line.interval = 0; // Due immediately for first test
            } else if (line.repetitions === 1) {
                line.interval = 1; // 1 day later
            } else if (line.repetitions === 2) {
                line.interval = 6;
            } else {
                line.interval = Math.round(line.interval * line.easeFactor);
            }
            line.repetitions += 1;
        } else {
            // Incorrect answer
            line.repetitions = 0;
            line.interval = 0; // Back to learning (due now)
        }

        // Adjust Ease Factor
        line.easeFactor = line.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
        if (line.easeFactor < 1.3) line.easeFactor = 1.3;

        // Calculate next review date (interval in days -> milliseconds)
        const millisecondsInDay = 24 * 60 * 60 * 1000;
        // Use a small negative offset for 0-interval to ensure it's "due" immediately despite millisecond drift
        const offset = line.interval === 0 ? -1000 : 0;
        line.nextReviewDate = Date.now() + (line.interval * millisecondsInDay) + offset;

        localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
        return line;
    },

    /**
     * Updates a line's study status
     */
    updateLineStatus(courseId, lineId, status) {
        const courses = this.getAllCourses();
        const course = courses.find(c => c.id === courseId);
        if (!course) return;

        const line = course.lines.find(l => l.id === lineId);
        if (!line) return;

        line.status = status; // 'not-studied', 'studied', 'mastered'
        localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
        return line;
    }
};
