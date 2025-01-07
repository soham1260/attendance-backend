require("dotenv").config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
mongoose.connect(process.env.DB);
const express = require('express');
const app = express();
var cors = require("cors");
app.use(cors());
app.use(express.json());
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT;


app.listen(process.env.PORT,() => {
    console.log("Listening to port "+process.env.PORT);
})

const teacherSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  department: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
  },
  password: {
    type: String,
    required: true,
  },
});

const Teacher = mongoose.model('Teacher', teacherSchema);

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
    unique: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Teacher',
    required: true,
  },
  students: [
    {
        type: String,
        required: true,
    },
  ],
  attendanceRecords: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceRecord',
    },
  ],
});

const Subject = mongoose.model('Subject', subjectSchema);

const attendanceRecordSchema = new mongoose.Schema({
  subjectId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  presentStudents: [
  {
    type: String,
    required: true,
  },
  ],
});
  
const AttendanceRecord = mongoose.model('AttendanceRecord', attendanceRecordSchema);

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  rollNo: {
    type: String,
    required: true,
    unique: true,
  },
  department: {
    type: String,
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  courses: [
    {
      type: String,
      required: true,
    },
  ],
});

const Student = mongoose.model('Student', studentSchema);

const authenticateToken = (req, res, next) => {
  let token = req.header('token');
  //console.log(token);
  
  if (!token) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.ID = decoded.id;
    next();
  } catch (err) {
    console.error(err);
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

app.get('/getNoOfStudentsAttended/:subject', async (req, res) => {
  const subjectName = req.params.subject;

  try {
    // Find the Subject document for the given subject name
    const subject = await Subject.findOne({ name: subjectName }).populate('attendanceRecords');

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Map attendance records to include the date and number of students present
    const attendanceData = subject.attendanceRecords.map((record) => ({
      date: record.date.toDateString(),
      studentsPresent: record.presentStudents.length,
    }));

    res.status(200).json({
      subject: subject.name,
      attendanceData,
    });
  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  console.log(email+password);
  
  try {
    // Check if the teacher exists
    const teacher = await Teacher.findOne({ email });
    if (!teacher) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Compare passwords directly
    if (teacher.password !== password) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign({ id: teacher._id }, JWT_SECRET, { expiresIn: '1h' } );
    res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Signup Route
app.post('/signup', async (req, res) => {
  const { name, email, department, phone, password } = req.body;

  if (!name || !email || !department || !password) {
    return res.status(400).json({ message: 'All required fields must be provided.' });
  }

  try {
    // Check if the email already exists
    const existingTeacher = await Teacher.findOne({ email });
    if (existingTeacher) {
      return res.status(400).json({ message: 'Email is already registered.' });
    }

    // Create a new teacher
    const newTeacher = new Teacher({
      name,
      email,
      department,
      phone,
      password,
    });

    await newTeacher.save();
    res.status(201).json({ message: 'Signup successful! You can now login.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An error occurred while signing up.' });
  }
});

// Student Login Route
app.post('/student-login', async (req, res) => {
  const { rollNo, password } = req.body;
  console.log(`Login Attempt: RollNo: ${rollNo}`);

  try {
    // Check if the student exists
    const student = await Student.findOne({ rollNo });
    if (!student) {
      return res.status(400).json({ message: 'Invalid roll number or password' });
    }

    if (student.password !== password) {
      return res.status(400).json({ message: 'Invalid roll number or password' });
    }

    // Generate JWT
    const token = jwt.sign({ id: student._id }, JWT_SECRET, { expiresIn: '1h' } );
    res.status(200).json({ token, message: 'Login successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Student Signup Route
app.post('/student-signup', async (req, res) => {
  const { name, rollNo, department, year, password } = req.body;

  if (!name || !rollNo || !department || !year || !password) {
    return res.status(400).json({ message: 'All required fields must be provided.' });
  }

  try {
    // Check if the roll number already exists
    const existingStudent = await Student.findOne({ rollNo });
    if (existingStudent) {
      return res.status(400).json({ message: 'Roll number is already registered.' });
    }

    // Create a new student
    const newStudent = new Student({
      name,
      rollNo,
      department,
      year,
      password,
      courses: [],
    });

    await newStudent.save();
    res.status(201).json({ message: 'Signup successful! You can now login.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An error occurred while signing up.' });
  }
});


app.get('/getNameAndSubjects', authenticateToken, async (req, res) => {
  try {
    const teacherId = req.ID; // Extracted from token

    // Fetch the subjects and populate the teacher's name
    const subjects = await Subject.find({ teacher: teacherId })
      .populate('teacher') // Populate the teacher's name
      .select('name code teacher _id'); // Select fields to include in the result

    if (!subjects.length) {
      const teacher = await Teacher.findById(teacherId);

      return res.status(404).json({ message: 'No subjects found for this teacher', teacher: teacher.name });
    }

    // Construct response
    const response = {
      teacher: subjects[0].teacher.name, // All subjects have the same teacher
      subjects: subjects.map(subject => ({
        name: subject.name,
        code: subject.code,
      })),
    };

    res.status(200).json(response);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/getNoSubjectStatistics/:subject', async (req, res) => {
  const subjectName = req.params.subject;

  try {
    // Find the Subject document for the given subject name
    const subject = await Subject.findOne({ name: subjectName }).populate('attendanceRecords');

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const totalStudents = subject.students.length;
    const attendanceRecords = subject.attendanceRecords;

    if (attendanceRecords.length === 0) {
      return res.status(200).json({
        averageAttendancePercentage: 0,
        totalDays: 0,
      });
    }

    // Calculate attendance details
    let totalAttendance = 0;
    attendanceRecords.forEach((record) => {
      totalAttendance += record.presentStudents.length;
    });

    const totalDays = attendanceRecords.length;
    const averageAttendancePercentage = ((totalAttendance / (totalStudents * totalDays)) * 100).toFixed(2);

    res.status(200).json({
      averageAttendancePercentage: parseFloat(averageAttendancePercentage),
      totalDays,
    });
  } catch (error) {
    console.error('Error fetching attendance data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/getAttendanceReport/:subject', async (req, res) => {
  const subjectName = req.params.subject;

  try {
    // Find the Subject and populate attendance records
    const subject = await Subject.findOne({ name: subjectName }).populate('attendanceRecords');

    if (!subject) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const attendanceRecords = subject.attendanceRecords;

    if (attendanceRecords.length === 0) {
      return res.status(404).json({ error: 'No attendance records found for this subject' });
    }

    // Extract the students array from the subject
    const allStudents = subject.students.sort(); // All enrolled students from the Subject

    // Extract all unique dates from attendance records
    const allDates = attendanceRecords
      .map((record) => record.date.toISOString().split('T')[0])
      .sort();

    // Create the Excel sheet header
    const sheetData = [['Student ID', ...allDates, 'Attendance %']];

    // Populate attendance data
    allStudents.forEach((student) => {
      const row = [student]; // Start with the student ID
      let totalPresent = 0;

      allDates.forEach((date) => {
        // Check if the student is present on the given date
        const record = attendanceRecords.find((rec) => rec.date.toISOString().split('T')[0] === date);
        if (record && record.presentStudents.includes(student)) {
          row.push('Y');
          totalPresent++;
        } else {
          row.push('N');
        }
      });

      // Calculate attendance percentage
      const attendancePercentage = ((totalPresent / allDates.length) * 100).toFixed(2);
      row.push(`${attendancePercentage}%`);

      sheetData.push(row);
    });

    // Create a workbook and a worksheet
    const workbook = xlsx.utils.book_new();
    const worksheet = xlsx.utils.aoa_to_sheet(sheetData); // Convert array to sheet
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Attendance Report');

    // Write workbook to a file
    const filePath = path.join(__dirname, `${subjectName}-Attendance-Report.xlsx`);
    xlsx.writeFile(workbook, filePath);

    // Send the file to the client
    res.download(filePath, `${subjectName}-Attendance-Report.xlsx`, (err) => {
      if (err) {
        console.error('Error sending file:', err);
        return res.status(500).json({ error: 'Error generating attendance report' });
      }

      // Delete the file after sending it
      fs.unlink(filePath, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    });
  } catch (error) {
    console.error('Error generating attendance report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/markAttendance', async (req, res) => {
  const { subject, enroll_no } = req.body;
  //console.log(subject + ' ' + enroll_no);
  try {
    // Fetch the subject document
    const subjectDoc = await Subject.findOne({ name: subject });
    //console.log(subjectDoc);

    if (!subjectDoc) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Extract the students array from the subject
    const enrolledStudents = subjectDoc.students;

    // Convert numeric enroll_no to student IDs
    // const mappedStudents = enroll_no
    //   .map((num) => `BT21CSE${String(num).padStart(3, '0')}`) // Format numbers as BT21CSEXXX
    //   .filter((studentId) => enrolledStudents.includes(studentId)); // Filter valid students

    const mappedStudents = enroll_no
      .filter((studentId) => enrolledStudents.includes(studentId)); // Filter valid students

    // If no valid students, return an error
    if (mappedStudents.length === 0) {
      return res.status(400).json({ error: 'No valid enroll numbers provided' });
    }

    // Get today's date (without time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if an attendance record already exists for this subjectId and date
    const existingRecord = await AttendanceRecord.findOne({
      subjectId: subjectDoc._id,
      date: today,
    });

    if (existingRecord) {
      // Add new students to the presentStudents array (avoiding duplicates)
      const uniqueStudents = [...new Set([...existingRecord.presentStudents, ...mappedStudents])];
      existingRecord.presentStudents = uniqueStudents;
      await existingRecord.save();


      return res.status(200).json({
        message: 'Attendance updated successfully',
        record: existingRecord,
      });
    } else {
      // Create a new attendance record
      const newAttendanceRecord = new AttendanceRecord({
        subjectId: subjectDoc._id,
        date: today,
        presentStudents: mappedStudents,
      });

      // Save the new attendance record
      await newAttendanceRecord.save();

      // Update the attendanceRecords array in the subject
      subjectDoc.attendanceRecords.push(newAttendanceRecord._id);
      await subjectDoc.save();

      return res.status(200).json({
        message: 'Attendance marked successfully',
        record: newAttendanceRecord,
      });
    }
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route to register a new course for a teacher
app.post('/registerCourse',authenticateToken,  async (req, res) => {
  //const { name, code, teacherId, students } = req.body;
  const { name, code, token } = req.body;

  const teacherId = req.ID;

  console.log(name + ' ' + code + ' ' + teacherId);
  try {
    // Check if the teacher exists
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    // Check if the course code is unique
    const existingSubject = await Subject.findOne({ code });
    if (existingSubject) {
      return res.status(400).json({ message: 'Course code already exists' });
    }

    const teacherObjectId = new mongoose.Types.ObjectId(teacherId);

    // Create a new subject
    const newSubject = new Subject({
      name,
      code,
      teacher: teacherObjectId,
      students: [], // List of students
      attendanceRecords: [], // Initialize with an empty array
    });

    // Save the subject to the database
    const savedSubject = await newSubject.save();

    res.status(201).json({ message: 'Course registered successfully', subject: savedSubject });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to fetch student profile and courses
app.get('/student/profile', authenticateToken, async (req, res) => {
  try {
    const studentId = req.ID; // Assuming the JWT middleware attaches the user ID to req.user

    // Fetch student details
    const student = await Student.findById(studentId).select('-password'); // Exclude password field

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Fetch courses the student is enrolled in
    const courses = await Subject.find({ code: { $in: student.courses } }).populate('teacher', 'name');

    res.status(200).json({ student, courses });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'An error occurred while fetching the profile and courses.' });
  }
});

app.get('/getCourses', async (req, res) => {
  try {
    const courses = await Subject.find().populate('teacher', 'name'); // Get all courses and populate teacher name
    res.json({ courses });
  } catch (err) {
    console.error('Error fetching courses:', err);
    res.status(500).json({ message: 'An error occurred while fetching courses.' });
  }
});

app.post('/registerStudent', authenticateToken, async (req, res) => {
  const { courseCode} = req.body;
  const studentId = req.ID;
  if (!courseCode || !studentId) {
    return res.status(400).json({ message: 'Course code and StudentId are required.' });
  }

  try {
    // Find the course
    const course = await Subject.findById(courseCode);
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Check if student is already enrolled in the course
    const student = await Student.findById(studentId);
    if (course.students.includes(student.rollNo)) {
      return res.status(400).json({ message: 'Student is already enrolled in this course.' });
    }

    // Add student to the course
    course.students.push(student.rollNo);
    await course.save();

    student.courses.push(course.code);
    await student.save();

    // Optionally, you can also update the student's record (if you have a student model)
    // await Student.findByIdAndUpdate(studentId, { $push: { courses: courseId } });

    res.json({ message: 'Student registered successfully for the course.', course });
  } catch (err) {
    console.error('Error registering student:', err);
    res.status(500).json({ message: 'An error occurred while registering the student.' });
  }
});

app.post('/getEnrolledStudents', async (req, res) => {
  const { subject } = req.body;
  //console.log(subject)
  try {
    const subjectDoc = await Subject.findOne({ code: subject }).populate('students', 'name id');
    if (!subjectDoc) {
      return res.status(404).json({ error: 'Subject not found' });
    }
    //console.log(subjectDoc);
    const students = await Student.find(
      { rollNo: { $in: subjectDoc.students } }, // Match roll numbers from the subject document
      { name: 1, rollNo: 1} // Only select name and rollNo fields
    );
    
    if (students.length === 0) {
      return res.status(404).json({ error: 'No students found for this subject' });
    }

    res.status(200).json({ students });
  } catch (error) {
    console.error('Error fetching enrolled students:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/attendance/dates', async (req, res) => {
  const { course } = req.body;
  //console.log(course);

  try {
    const subjectDoc = await Subject.findOne({ code: course }).populate('attendanceRecords');
    if (!subjectDoc) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Extract and format attendance record dates
    const dates = subjectDoc.attendanceRecords.map(record => 
      //record.date.toISOString().split('T')[0] // Format: YYYY-MM-DD
      record.date.toDateString()
    );

    res.status(200).json({ dates: [...new Set(dates)] }); // Return unique dates
  } catch (error) {
    console.error('Error fetching attendance dates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/attendance', async (req, res) => {
  const { course, date } = req.body;

  try {
    const subjectDoc = await Subject.findOne({ code: course }).populate('attendanceRecords');
    if (!subjectDoc) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Find the attendance record for the given date
    const record = subjectDoc.attendanceRecords.find(
      record => record.date.toDateString() === date
    );
    // const record = subjectDoc.attendanceRecords.find(
    //   record => record.date.toISOString().split('T')[0] === date
    // );

    if (!record) {
      return res.status(404).json({ error: 'No attendance record found for the selected date' });
    }

    // Populate students and determine attendance status
    const students = await Student.find({ rollNo: { $in: subjectDoc.students } });
    const attendance = students.map(student => ({
      rollNo: student.rollNo,
      name: student.name,
      present: record.presentStudents.includes(student.rollNo),
    }));

    res.status(200).json({ students: attendance });
  } catch (error) {
    console.error('Error fetching attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/attendance/update', async (req, res) => {
  const { course, date, students } = req.body;

  try {
    const subjectDoc = await Subject.findOne({ code: course }).populate('attendanceRecords');
    if (!subjectDoc) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    // Find the attendance record for the given date
    const record = subjectDoc.attendanceRecords.find(
      record => record.date.toDateString() === date
    );
    // const record = subjectDoc.attendanceRecords.find(
    //   record => record.date.toISOString().split('T')[0] === date
    // );

    if (!record) {
      return res.status(404).json({ error: 'No attendance record found for the selected date' });
    }

    // Update the attendance record with the new student list
    record.presentStudents = students.filter(student => student.present).map(student => student.rollNo);
    await record.save();

    res.status(200).json({ message: 'Attendance updated successfully', record });
  } catch (error) {
    console.error('Error updating attendance:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/attendanceExistCheck', async (req, res) => {
  const { subjectCode, date } = req.query;

  try {
    const subjectDoc = await Subject.findOne({ code: subjectCode })

    // const attendance = await AttendanceRecord.find({
    //   subjectId: subjectDoc._id
    // });

    // const record = attendance.find(
    //   record => record.date.toDateString() === date
    // );

    const record = await AttendanceRecord.findOne({
      subjectId: subjectDoc._id,
      date: {
        $gte: new Date(date).setHours(0, 0, 0, 0), // Start of the day
        $lt: new Date(date).setHours(23, 59, 59, 999) // End of the day
      }
    });

    //console.log(record);

    if (record) {
      res.json({ exists: true });
    } else {
      res.json({ exists: false });
    }
  } catch (err) {
    console.error('Error checking attendance:', err);
    res.status(500).json({ message: 'An error occurred while checking attendance.' });
  }
});

app.post('/attendance/delete', async (req, res) => {
  const { course, date } = req.body;
  try {
    const subjectDoc = await Subject.findOne({ code: course });
    await AttendanceRecord.deleteOne({ 
      subjectId: subjectDoc._id, 
      date: {
        $gte: new Date(date).setHours(0, 0, 0, 0), // Start of the day
        $lt: new Date(date).setHours(23, 59, 59, 999) // End of the day
      }
    });
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete attendance record' });
  }
});

