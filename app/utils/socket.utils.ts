import { Dispatch, SetStateAction } from "react";
import { Socket } from "socket.io-client";

export const onUserSet = (
  socket: Socket,
  setter: Dispatch<SetStateAction<string[]>>
) => {
  socket.on("user-set", (value: string) => {
    console.log("About to set user: ", value);
    setter(prev=> [...prev, value])
  });

  
};

export const onUserDelete = (
  socket: Socket,
  setter: Dispatch<SetStateAction<string[]>>
) => {
  socket.on("user-delete", (value: string) => {
    console.log("About to delete user: ", value);
    setter(prev=> prev?.filter(i => i !== value))
  });
};
