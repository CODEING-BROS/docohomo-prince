import { Step, StepLabel, Stepper } from '@mui/material';
import React, { useState } from 'react'

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: "90%",
  maxWidth: 400,
  background: '#fff',
  border: 'none',
  borderRadius: "20px",
  boxShadow: 24,
  padding: "20px",
};
export default function OrderTracking({ trackOrderDetails, orderId, onClose }) {
  return (
    <div style={style}>
      <span className='sr-close' onClick={onClose}>X</span>
      <div className='tracking-header'>
        <span className='fas fa-cart-arrow-down mr-3 sideIcon' />
        <div className='orderId'>
          <p className='order-text'>OrderID</p>
          <p className='order-id'>{orderId}</p>
        </div>
      </div>
      <div className='order-stepper'>
        {trackOrderDetails.length > 0 ? <Stepper activeStep={trackOrderDetails.length} orientation="vertical">
          {
            trackOrderDetails?.map((data, index) => (
              data['sr-status-label'] !== "NA" ? <Step key={index}>
                <StepLabel>
                  <span className='sr-label'>{data['sr-status-label']}</span><br />
                  <span className='sr-loacetion'>{data.location}</span><br />
                  <span className='sr-date'>{data.date}</span>
                </StepLabel>
              </Step> : ""
            ))
          }
        </Stepper>: <div className='notFoundData' >We will provide tracking details once we receive them from our delivery partner.</div>
        }
      </div>
      <style>
        {
          `
            .tracking-header{
              display: flex;
              align-items: center;
            }
            .sideIcon{
              color: #005B3C;
            }
            .orderId{
              display: flex;
              flex-direction: column;
              gap: 8px;
            }
            .order-text{
              font-size: 16px;
              font-weight: 500;
            }
            .order-id{
              font-size: 14px;
              font-weight: bold;
            }
            .notFoundData{
              line-height: 130%;
              font-size: 14px;
            }
            .sr-close{
              position: absolute;
              top: 15px;
              right: 15px;
              width: 20px;
              height: 20px;
              color: red;
              font-size: 24px;
              line-height: 20px;
              font-weight: 600;
              cursor: pointer;
            }
            .order-stepper{
              margin: 10px 0;
              max-height: 80vh;
              overflow: scroll;
            }
            .order-stepper::-webkit-scrollbar {
              display: none;
            }
            .sr-label{
              font-size: 16px;
            }
          `
        }
      </style>
    </div>
  )
}
