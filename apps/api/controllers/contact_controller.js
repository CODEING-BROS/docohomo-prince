const Contact_Schema = require("../modals/Contact");
const Utils = require("../utils/Utils");

// get all banners
const getAllContact = async(req,res)=>{
    try{
        const findAll = await Contact_Schema.find({}).sort({createdAt:-1});
        // console.log(findAll)
        res.status(200).send(findAll);
    
    }
    catch(err){
        console.log(err);
        res.status(500).send("something went wrong !!")
    }
}

// add new banners
const addNewContact = async(req,res)=>{
    console.log(req.body)
    // return res.status(200).send({status:true,message:'Details send successfully !!'});

    try{
        const create = new Contact_Schema({
            name: req.body?.name,
            email: req.body?.email,
            message: req.body?.message,
            phoneNumber: Number(req.body?.phoneNumber)
        })
        const result = await create.save();
        res.status(200).send({status:true,message:'Details send successfully !!'});

    }
    catch(err){
        console.log(err);
        res.status(500).send('something went wrong !!')
    }
}

// delete contact
const deleteContact = async(req,res)=>{
    // const emailId = req.params.email_id;
    // console.log("emailId",emailId)
    try{
        const findAndDelete = await Contact_Schema.deleteMany({
            _id: {
                $in: req.body,
            },
        });
        res.status(200).send({status:true,message:'Contact deleted successfully !!'})

    }
    catch(err){
        console.log(err);
        res.status(500).send("something went wrong !!")
    }
}

// update contact
const updateContact = async(req,res)=>{
    const emailId = req.params.email_id;
    // console.log("emailId",emailId)
    try{
        console.log(res.data)
        const findAndUpdate = await Contact_Schema.findByIdAndUpdate(emailId,{ $set: {isRead: true}});
        // console.log(res.data,findAndUpdate)
        res.status(200).send({status:true,message:'Contact updated successfully !!'})

    }
    catch(err){
        console.log(err);
        res.status(500).send("something went wrong !!")
    }
}

// SEARCH IN DOCTOR ENQUIRY
const searchContactEnquiry = async (req, res) => {
    const searchValue = req.query.search;
    const searchRegex = Utils.createRegex(searchValue);
    let result;
    try {
        result = await Contact_Schema.find({
            name : { $regex: searchRegex },
        }).sort({ createdAt: -1 });
        // if (!result.length > 0 && Number(req.query.search)) {
        //     result = await Contact_Schema.find({
        //         phoneNumber: Number(req.query.search),
        //     }).sort({ createdAt: -1 });
        // }
        res.status(200).send(result);
    } catch (err) {
        console.log(err);
        res.status(500).send("Something went wrong !!");
    }
  };

  




exports.getAllContact = getAllContact;
exports.addNewContact = addNewContact;
exports.searchContactEnquiry = searchContactEnquiry;
exports.deleteContact = deleteContact;
exports.updateContact = updateContact;