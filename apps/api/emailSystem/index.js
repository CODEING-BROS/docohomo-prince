const nodemailer = require('nodemailer');
const fs = require('fs');
const pug = require('pug');
const path = require('path');

const formatDate = (dateString) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.getMonth() + 1; // Months are zero-indexed
    const year = date.getFullYear();
  
    // Pad single-digit day and month with leading zeros
    const formattedDay = day < 10 ? `0${day}` : day;
    const formattedMonth = month < 10 ? `0${month}` : month;
  
    return `${year}-${formattedMonth}-${formattedDay}`;
  };

const orderIsPlacedCustomer =(body)=>{
    console.log("email:",body)
    if (process.env.LOCAL_MODE === "true") {
        console.log("[LOCAL_MODE] order email skipped for", body.customer_email);
        return;
    }
    try {
        const compiledFunction = pug.compileFile(path.join(__dirname, '/pugFile/orderIsPlaced.pug'));
        const html = compiledFunction({data:body,date: formatDate(body.createdAt)});
        
        let mailer = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            service: "Gmail",
            auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
            },
        });
    
        let sender = "DocHomoeo Email Test";
        let mailOptions = {
            from: sender,
            // to: "nainmongia1@gmail.com",
            // to: "gyangps1998@gmail.com",
            to: body.customer_email,
            subject: "Confirmation: Your Order with DocHomoeo",
            html: html,
        };
    
        mailer.sendMail(mailOptions, function (err, response) {
            if (err) console.log(err);
            else console.log("Mail has been sent successfully");
        });
    } catch (error) {
        console.log(error)
    }
}

exports.orderIsPlacedCustomer = orderIsPlacedCustomer;