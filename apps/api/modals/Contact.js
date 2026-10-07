const mongoose = require("mongoose")
const Contact_Schema = new mongoose.Schema(
    {
        name:{
            type:String,
            required: true
        },
        email:{
            type:String,
            required: true
        },
        message:{
            type:String,
            required: true
        },
        phoneNumber:{
            type:Number,
            required: true
        },
        isRead: { 
            type:Boolean,
            default: false
        }
    },{timestamps:true}
)

module.exports = mongoose.model("Contact",Contact_Schema)