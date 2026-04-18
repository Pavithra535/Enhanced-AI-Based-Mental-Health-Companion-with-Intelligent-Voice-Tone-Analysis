const mongoose = require('mongoose');

// Appointment schema
const appointmentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    specialist: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    timeSlot: {
        type: String,
        required: true
    },
    patientLocation: {
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        latitude: { type: Number },
        longitude: { type: Number }
    },
    nearbyProfessionalContact: {
        name: { type: String, trim: true },
        role: { type: String, trim: true },
        whatsappNumber: { type: String, trim: true }
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'completed', 'canceled'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Export the model
module.exports = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);