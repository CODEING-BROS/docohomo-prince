import React from 'react'
// import logo from '../assests/ssa_logo.png'
import {editable_config} from "../editable_config"

function Logo() {
  return (
    <>
      {/* <img src={require('../assests/ssa_logo.png')} /> */}
      <img className='ssa_logo' src={editable_config.Logo}/>
    </>
  )
}

export default Logo