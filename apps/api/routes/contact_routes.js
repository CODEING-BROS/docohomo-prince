const express = require("express")
const router = express.Router();
const Contact_Controller = require("../controllers/contact_controller");


router.get("/get/all/contact",Contact_Controller.getAllContact);
router.post('/add/contact',Contact_Controller.addNewContact);
router.get("/search/emailEnquiry",Contact_Controller.searchContactEnquiry);
router.delete("/delete/contact",Contact_Controller.deleteContact);
router.patch("/update/contact/:email_id",Contact_Controller.updateContact);

module.exports = router