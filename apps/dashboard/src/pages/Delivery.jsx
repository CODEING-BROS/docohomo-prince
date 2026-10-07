import * as React from "react";
import { useState, useEffect } from "react";
import axios from "axios";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import LoadingSpinner from "../components/Spinner";
import TextField from "@mui/material/TextField";
import Button from '@mui/material/Button';

export default function EnhancedTable() {
  const [loading, setLoading] = useState(false);
  const [deliveryCharges, setDeliveryCharges] = useState({});
  const [newCharge, setNewCharge] = useState({ cap: "", amount: "" });

  const fetchDeliveryCharges = async () => {
    try {
      setLoading(true);
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/delivery/get`
      );
      console.log(response.data);
      setDeliveryCharges(response.data.discount);
    } catch (error) {
      console.error("Error fetching delivery charges:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateDeliveryCharge = async () => {
    try {
      setLoading(true);
      await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/delivery/update/${deliveryCharges._id}`,
        {
          cap: newCharge.cap,
          amount: newCharge.amount,
        }
      );
      setNewCharge({ cap: "", amount: "" });
      fetchDeliveryCharges(); // Refresh the list of charges after updating
    } catch (error) {
      console.error("Error updating delivery charge:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveryCharges();
  }, []); // Fetch delivery charges on component mount

  return (
    <div
      className="custom-container"
      style={{
        height: "50vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "50px"
      }}
    >
      <Box sx={{ width: "80%",marginBottom:"20px" }}>
        <LoadingSpinner loading={loading} />

        <Paper
          elevation={3}
          sx={{
            width: "50%",
            height: "50vh",
            mb: 2,
            borderRadius: 1,
            padding: 2,
          }}
        >
          <h2 className="">Delivery Charges</h2>

          <h3>Current Charges:</h3>
          <h4>Cap: {deliveryCharges?.cap}</h4>
          <h4>Amount: {deliveryCharges?.amount}</h4>
          <div>
            {/* Update Delivery Charge Form */}
            <form
              style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                justifyContent: "space-between",
                alignSelf: "center",
                alignContent: "center",
                marginBottom:"20px"
              }}
              onSubmit={(e) => {
                e.preventDefault();
                updateDeliveryCharge();
              }}
            >
              <label>Update Delivery Charge:</label>
              <br />
              {/* <input
                type="text"
                placeholder="New Cap"
                value={newCharge.cap}
                onChange={(e) =>
                  setNewCharge({ ...newCharge, cap: e.target.value })
                }
              /> */}
              <TextField
                id="outlined-basic"
                label="New Cap"
                variant="outlined"
                value={newCharge?.cap}
                onChange={(e) =>
                  setNewCharge({ ...newCharge, cap: e.target.value })
                }
              />
              <br />
              <TextField
                id="outlined-basic"
                label="New Amount"
                variant="outlined"
                value={newCharge?.amount}
                onChange={(e) =>
                  setNewCharge({ ...newCharge, amount: e.target.value })
                }
              />
              <br />
              <Button
                style={{
                  marginBottom:"30px"
                }}
                variant="contained"
                type="submit"
                disabled={!newCharge.cap && !newCharge.amount}
              >
                Update
              </Button>
              <br />
            </form>

          </div>
        </Paper>
      </Box>
    </div>
  );
}
