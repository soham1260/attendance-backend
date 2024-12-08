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

const authenticateToken = (req, res, next) => {
  let token = req.header('token');
  console.log(token);
  
  if (!token) {
    return res.status(401).json({ message: 'Authorization token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.teacherId = decoded.id;
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
    const token = jwt.sign({ id: teacher._id }, JWT_SECRET,);
    res.status(200).json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

app.get('/getNameAndSubjects', authenticateToken, async (req, res) => {
  try {
    const teacherId = req.teacherId; // Extracted from token

    // Fetch the subjects and populate the teacher's name
    const subjects = await Subject.find({ teacher: teacherId })
      .populate('teacher') // Populate the teacher's name
      .select('name code teacher _id'); // Select fields to include in the result

    if (!subjects.length) {
      return res.status(404).json({ message: 'No subjects found for this teacher' });
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

    // Extract all unique student IDs
    const allStudents = Array.from(
      new Set(attendanceRecords.flatMap((record) => record.presentStudents))
    ).sort(); // Sorted list of all student IDs

    // Extract all unique dates
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
