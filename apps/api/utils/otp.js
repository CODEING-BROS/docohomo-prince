const msg91 = require('msg91').default;

// LOCAL_MODE: no SMS is sent, LOCAL_OTP is the accepted code
const isLocalMode = process.env.LOCAL_MODE === "true";

if(!isLocalMode) msg91.initialize({authKey: process.env.MSG_AUTH_KEY});

//========= SEND OTP TO NUMBER ========
 async function sendOtpToNumber (phone_number) {
    // const {phone_number} = req.params;
    console.log(phone_number);
    try {
        if(!phone_number) return { status: false };
        if(isLocalMode){
            console.log(`[LOCAL_MODE] OTP for ${phone_number} is ${process.env.LOCAL_OTP}`)
            return { status:true };
        }
        let otp = msg91.getOTP(process.env.MSG_TEMPLATE_ID);
        // Send OTP
       const otpSuccess= await otp.send("+91"+phone_number);
       //  const otpSuccess =  await Utils.sendOtp(phone_number)
        console.log("otpSuccess=>",otpSuccess)
        // res.status(200).send({status:true,message:'otp sent!!'})
        return { status:true };
    } catch (error) {
        console.log(error)
        return { status:false };
    }
}

//========= VERIFY OTP FOR USER ========
async function verifyOtpForUser( phone_number,otp_user) {
    
    try {
        if(!phone_number) return { status: false };
        if(!otp_user) return { status: false };
        if(isLocalMode){
            return { status: String(otp_user) === String(process.env.LOCAL_OTP) };
        }
        console.log(phone_number);
        let otp = msg91.getOTP(process.env.MSG_TEMPLATE_ID);
         console.log(otp)
        let result = await otp.verify("+91"+phone_number,parseInt(otp_user));
        console.log("otyVerify AFTER==>",result)
        if(result?.message === 'OTP verified success' ){
            console.log("verified success")
            return { status: true };
        }
        return { status: false };

        
    } catch (error) {
        console.log(error)
        return { status: false };
    }
}

module.exports = {
    verifyOtpForUser,
    sendOtpToNumber
}