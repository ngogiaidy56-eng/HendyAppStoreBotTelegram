import { useCallback, useEffect, useState } from 'react';
export function useAuth() {
  const [token,setToken]=useState(()=>sessionStorage.getItem('hendy_session')||'');
  const signOut=useCallback(()=>{sessionStorage.removeItem('hendy_session');setToken('');},[]);
  useEffect(()=>{if(token)sessionStorage.setItem('hendy_session',token);},[token]);
  return {token,setToken,signOut,isAuthenticated:Boolean(token)};
}
