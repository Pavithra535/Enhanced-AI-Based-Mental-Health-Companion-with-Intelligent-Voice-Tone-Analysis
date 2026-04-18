const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');

const VERIFIED_PROFESSIONALS = [
    {
        id: 'np-001',
        name: 'Dr. Aarthi Raman',
        role: 'Clinical Psychologist',
        specialty: 'Depression, Anxiety, Student Burnout',
        city: 'Chennai',
        state: 'Tamil Nadu',
        experience: 9,
        whatsappNumber: '919842001234'
    },
    {
        id: 'np-002',
        name: 'Dr. Karthik Narayan',
        role: 'Psychiatrist',
        specialty: 'Mood Disorders, Medication Support',
        city: 'Chennai',
        state: 'Tamil Nadu',
        experience: 11,
        whatsappNumber: '919840001122'
    },
    {
        id: 'np-003',
        name: 'Dr. Nivetha S',
        role: 'Counseling Psychologist',
        specialty: 'Trauma Recovery, Relationship Therapy',
        city: 'Coimbatore',
        state: 'Tamil Nadu',
        experience: 7,
        whatsappNumber: '919876543210'
    },
    {
        id: 'np-004',
        name: 'Dr. Hari Prakash',
        role: 'Therapist',
        specialty: 'Stress Management, Youth Counseling',
        city: 'Madurai',
        state: 'Tamil Nadu',
        experience: 8,
        whatsappNumber: '919845678901'
    }
];

function sanitizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function mockLookupCityFromCoordinates(lat, lng) {
    // Chennai area bounding box fallback
    if (
        Number.isFinite(lat) && Number.isFinite(lng) &&
        lat >= 12.80 && lat <= 13.25 &&
        lng >= 79.95 && lng <= 80.35
    ) {
        return { city: 'Chennai', state: 'Tamil Nadu', source: 'mock_lookup' };
    }
    return { city: 'Chennai', state: 'Tamil Nadu', source: 'default_fallback' };
}

function buildWhatsappLink(whatsappNumber, professionalName, city) {
    const phone = sanitizePhone(whatsappNumber);
    const text = encodeURIComponent(`Hi ${professionalName}, I found your profile on Soul Space and would like to book a consultation in ${city}.`);
    return `https://wa.me/${phone}?text=${text}`;
}

// Book a new appointment
router.post('/book', async (req, res) => {
    try {
        console.log('Appointment booking request received:', req.body);
        
        const {
            patientName,
            patientEmail,
            patientPhone,
            specialistId,
            specialistName,
            specialistRole,
            specialistSpecialty,
            appointmentDate,
            appointmentTime,
            counselingType,
            concerns,
            consultationFee,
            platformFee,
            totalAmount
        } = req.body;

        // Validate required fields
        if (!patientName || !patientEmail || !patientPhone || !specialistId || 
            !appointmentDate || !appointmentTime || !counselingType) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Check if the appointment slot is already booked
        const existingAppointment = await Appointment.findOne({
            specialistId: specialistId,
            appointmentDate: new Date(appointmentDate),
            appointmentTime: appointmentTime,
            status: { $ne: 'cancelled' }
        });

        if (existingAppointment) {
            return res.status(409).json({
                success: false,
                message: 'This time slot is already booked'
            });
        }

        // Generate meeting details based on counseling type
        let meetingDetails = {};
        if (counselingType === 'video-call') {
            meetingDetails.meetingLink = `https://meet.mindspace.com/room/${Date.now()}`;
            meetingDetails.meetingId = `MS-${Date.now()}`;
        } else if (counselingType === 'phone-call') {
            meetingDetails.meetingId = `CALL-${Date.now()}`;
        }

        // Create new appointment
        const newAppointment = new Appointment({
            patientName,
            patientEmail,
            patientPhone,
            specialistId,
            specialistName,
            specialistRole,
            specialistSpecialty,
            appointmentDate: new Date(appointmentDate),
            appointmentTime,
            counselingType,
            concerns: concerns || '',
            consultationFee: consultationFee || 1500,
            platformFee: platformFee || 0,
            totalAmount: totalAmount || 1500,
            ...meetingDetails,
            status: 'confirmed' // Auto-confirm for demo
        });

        const savedAppointment = await newAppointment.save();

        console.log('Appointment saved successfully:', savedAppointment._id);

        res.status(201).json({
            success: true,
            message: 'Appointment booked successfully',
            appointment: {
                id: savedAppointment._id,
                patientName: savedAppointment.patientName,
                specialistName: savedAppointment.specialistName,
                appointmentDate: savedAppointment.appointmentDate,
                appointmentTime: savedAppointment.appointmentTime,
                counselingType: savedAppointment.counselingType,
                status: savedAppointment.status,
                totalAmount: savedAppointment.totalAmount,
                meetingLink: savedAppointment.meetingLink,
                meetingId: savedAppointment.meetingId
            }
        });

    } catch (error) {
        console.error('Error booking appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to book appointment',
            error: error.message
        });
    }
});

// Lookup city/state from coordinates (mock lookup for Chennai/Tamil Nadu)
router.get('/location-lookup', (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.status(400).json({
                success: false,
                message: 'lat and lng query params are required'
            });
        }

        const location = mockLookupCityFromCoordinates(lat, lng);
        return res.json({
            success: true,
            location
        });
    } catch (error) {
        console.error('Error in location lookup:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to resolve location',
            error: error.message
        });
    }
});

// Nearby professionals by geolocation or city/state
router.get('/nearby-professionals', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lng = parseFloat(req.query.lng);
        let city = (req.query.city || '').trim();
        let state = (req.query.state || '').trim();
        let locationSource = 'query';

        if (!city || !state) {
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                const resolved = mockLookupCityFromCoordinates(lat, lng);
                city = city || resolved.city;
                state = state || resolved.state;
                locationSource = resolved.source;
            } else {
                city = city || 'Chennai';
                state = state || 'Tamil Nadu';
                locationSource = 'default_fallback';
            }
        }

        const cityLower = city.toLowerCase();
        const stateLower = state.toLowerCase();

        const matches = VERIFIED_PROFESSIONALS
            .filter((pro) => (
                pro.city.toLowerCase() === cityLower &&
                pro.state.toLowerCase() === stateLower
            ))
            .map((pro) => ({
                ...pro,
                whatsappLink: buildWhatsappLink(pro.whatsappNumber, pro.name, city)
            }));

        return res.json({
            success: true,
            location: { city, state, source: locationSource },
            count: matches.length,
            professionals: matches
        });
    } catch (error) {
        console.error('Error fetching nearby professionals:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch nearby professionals',
            error: error.message
        });
    }
});

// Get all appointments (for admin)
router.get('/all', async (req, res) => {
    try {
        const appointments = await Appointment.find()
            .sort({ createdAt: -1 })
            .limit(100);

        res.json({
            success: true,
            appointments: appointments
        });

    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointments',
            error: error.message
        });
    }
});

// Get appointments by patient email
router.get('/patient/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const appointments = await Appointment.find({ patientEmail: email })
            .sort({ appointmentDate: -1 });

        res.json({
            success: true,
            appointments: appointments
        });

    } catch (error) {
        console.error('Error fetching patient appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch patient appointments',
            error: error.message
        });
    }
});

// Get appointments by specialist
router.get('/specialist/:specialistId', async (req, res) => {
    try {
        const { specialistId } = req.params;
        
        const appointments = await Appointment.find({ specialistId: specialistId })
            .sort({ appointmentDate: -1 });

        res.json({
            success: true,
            appointments: appointments
        });

    } catch (error) {
        console.error('Error fetching specialist appointments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch specialist appointments',
            error: error.message
        });
    }
});

// Update appointment status
router.patch('/:appointmentId/status', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        const { status } = req.body;

        if (!['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const updatedAppointment = await Appointment.findByIdAndUpdate(
            appointmentId,
            { status, updatedAt: Date.now() },
            { new: true }
        );

        if (!updatedAppointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        res.json({
            success: true,
            message: 'Appointment status updated',
            appointment: updatedAppointment
        });

    } catch (error) {
        console.error('Error updating appointment status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update appointment status',
            error: error.message
        });
    }
});

// Get appointment by ID
router.get('/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        
        const appointment = await Appointment.findById(appointmentId);

        if (!appointment) {
            return res.status(404).json({
                success: false,
                message: 'Appointment not found'
            });
        }

        res.json({
            success: true,
            appointment: appointment
        });

    } catch (error) {
        console.error('Error fetching appointment:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch appointment',
            error: error.message
        });
    }
});

module.exports = router;
