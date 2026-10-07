import React, { useEffect, useState } from 'react'
import Loading from '../../components/Other/Loading';
import { CircularProgress, FormControlLabel, Radio } from '@mui/material';
import axios from 'axios';
import { baseUrl } from '../../../config';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';

function Profile() {
  const [userDetails, setUserDetails] = useState({});
  const [loading, setLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const currentUser = useSelector((state) => state.userReducer.user);

  const getUserDetails = async ()=>{
    setLoading(true);
    const response = await axios.get(
      `${baseUrl}/api/user/get/${currentUser?.user._id}`,
      {
        userId: currentUser?.user._id,
      },
      { withCredentials: true }
    ).then((response)=>{
      setLoading(false)
      console.log("hsdyusiudkjewkj",response.data)
      if(response.status===200){
        const resp = response.data;
        let obj = {
          gender: resp.gender,
          firstName: resp.firstName,
          lastName: resp.lastName,
          username: resp.username,
          email: resp.email,
          phone_number: resp.phone_number,
          alternateMobileNumber: resp.alternateMobileNumber,
          houseNumber: resp.houseNumber,
          town: resp.town,
          city: resp.city,
          state: resp.state,
          country: resp.country,
          pincode: resp.pincode,
          address: resp.address
        }
        setUserDetails(obj);
      }
      else{
        toast.error("Somthing error happens.")
      }
    }).catch((err)=>{
      setLoading(false);
      toast.error("Somthing Internal error happens.")
    })
  }
  useEffect(()=>{
    getUserDetails();
  },[])

  const handleOnChange = (e)=>{
    const {id, value} = e.target;

    setUserDetails({...userDetails,[id]: value});
  }
  const handleOnChangeGender = (e)=>{
    const {id, value} = e.target;

    setUserDetails({...userDetails,gender: value});
  }
  const handleUpdate =  async(e)=>{
    e.preventDefault();
    console.log(userDetails);
    setIsLoading(true);
    axios.patch(
      `${baseUrl}/api/user/edit/${currentUser?.user._id}`,
      {
        ...userDetails
      },
      { withCredentials: true }
    ).then((response)=>{
      if(response.status==200){
        setIsLoading(false);
        toast.success("Profile updated successfully.");
      }
      else{
        setIsLoading(false);
        toast.error("Somthing error happens.")
      }
    }).catch(()=>{
      setIsLoading(false);
      toast.error("Internal Error");
    })
  }
  if(loading) return <Loading flag={true} />
  return (
    <>
      <div>
        <form className='row p-0' onSubmit={handleUpdate}>

          <div className='row col-12 formData1'>
            <div className='col-6'><FormControlLabel className='inputRadio'  control={<Radio />} value="male" checked={userDetails.gender == "male"} onChange={handleOnChangeGender} label="Male" /></div>
            <div className='col-6'><FormControlLabel className='inputRadio'  control={<Radio />} value="female" checked={userDetails.gender == "female"} onChange={handleOnChangeGender} label="Female" /></div>
          </div>

          <div className='col-12 col-sm-6 pb-3 formData'>
            <label htmlFor="firstName">First Name<span className='starRequired fa fa-star-o'>*</span></label>
            <input type='text' id='firstName' value={userDetails.firstName} onChange={handleOnChange} required />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor="lastName">Last Name<span className='starRequired fa fa-star-o'>*</span></label>
            <input type='text' id="lastName" value={userDetails.lastName} onChange={handleOnChange} required/>
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor="username">User Name</label>
            <input type='text' id="username" value={userDetails.username} onChange={handleOnChange} disabled/>
            {/* {
              !isUnique && <p>This User Already exist. Please Try another user name.</p>
            } */}
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='email'>Email<span className='starRequired fa fa-star-o'>*</span></label>
            <input type='email' id="email" value={userDetails.email} onChange={handleOnChange} required />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='phone_number'>Mobile Number</label>
            <input type='tel' id="phone_number" value={userDetails.phone_number} onChange={handleOnChange} disabled />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='alternateMobileNumber'>Alternate Mobile Number</label>
            <input type='tel' id="alternateMobileNumber" value={userDetails.alternateMobileNumber} onChange={handleOnChange} min="0" />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='houseNumber'>Flat/House Number</label>
            <input type='text' id="houseNumber" value={userDetails.houseNumber} onChange={handleOnChange}/>
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='town'>Village/Town<span className='starRequired fa fa-star-o'>*</span></label>
            <input type='text' id="town" value={userDetails.town} onChange={handleOnChange} required />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='city'>City<span className='starRequired fa fa-star-o'>*</span></label>
            <input type='text' id="city" value={userDetails.city} onChange={handleOnChange} required />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='state'>State<span className='starRequired fa fa-star-o'>*</span></label>
            <input type='text' id="state" value={userDetails.state} onChange={handleOnChange} required />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='country'>Country</label>
            <input type='text' id="country" value={userDetails.country} onChange={handleOnChange} />
          </div>

          <div className="col-12 col-sm-6 py-3 formData">
            <label htmlFor='pincode'>Pincode<span className='starRequired fa fa-star-o'>*</span></label>
            <input type='tel' id="pincode" value={userDetails.pincode} onChange={handleOnChange} minLength={6} maxLength={6} required />
          </div>

          <div className="col-12 py-3 formData">
            <label htmlFor='address'>Address<span className='starRequired fa fa-star-o'>*</span></label>
            <textarea type='text' id="address" value={userDetails.address} onChange={handleOnChange} required />
          </div>

          <div className='col-12 my-3'>
            {isLoading ? <CircularProgress color="success" size="25px" />:<button className='updateBtn'>Update</button>}
          </div>
        </form>
      </div>
      <style>
        {`
          .loading-overlay{
            position: relative !important;
          }

          .formData{
            font-size: 14px;
          }

          .formData1{
            font-size: 20px;
          }
          // .formData1   .inputRadio{
          //   width: 20px;
          //   height: 20px;
          //   margin-left: 5px;
          // }
          
          .css-1hbvpl3-MuiSvgIcon-root{
            color: #005B3C;
          }

          .css-vqmohf-MuiButtonBase-root-MuiRadio-root.Mui-checked{
            color: #005B3C;
          }

          .formData input, .formData textarea{
            width: 100%;
            margin-top: 5px;
            font-size: 14px;
            padding: 10px;
            border-radius: 4px;
            border: 1px solid #a0a0a0;
          }
          .formData textarea{
            height: 100px;
          }
          .updateBtn{
            color: white;
            background-color: #005B3C;
            font-size: 14px;
            font-weight: 600;
            padding: 10px 20px;
            border: none;
            border-radius: 8px;
            max-height: 37px;
          }
          .starRequired{
            color: red;
          }
          @media screen and (max-width: 576px) {
            .updateBtn {
                width: 100%;
            }
        `}
      </style>
    </>
  )
}

export default Profile
