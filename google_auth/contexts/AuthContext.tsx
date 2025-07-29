import React, { createContext, useContext, useState, useEffect } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';

WebBrowser.maybeCompleteAuthSession();

interface User {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Replace these with your actual Google OAuth client configuration
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || 'your-google-client-id';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const discovery = {
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://www.googleapis.com/oauth2/v4/token',
    revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
  };

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      scopes: ['openid', 'profile', 'email'],
      additionalParameters: {},
      extraParams: {
        access_type: 'offline',
      },
      responseType: AuthSession.ResponseType.Code,
    },
    discovery
  );

  useEffect(() => {
    checkAuthState();
  }, []);

  useEffect(() => {
    if (response?.type === 'success') {
      handleAuthResponse(response);
    }
  }, [response]);

  const checkAuthState = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthResponse = async (response: AuthSession.AuthSessionResult) => {
    if (response.type === 'success') {
      try {
        // Exchange authorization code for access token
        const tokenResponse = await AuthSession.exchangeCodeAsync(
          {
            clientId: GOOGLE_CLIENT_ID,
            code: response.params.code,
            extraParams: {
              code_verifier: request?.codeVerifier || '',
            },
            redirectUri: AuthSession.makeRedirectUri({
              useProxy: true,
            }),
          },
          discovery
        );

        if (tokenResponse.accessToken) {
          // Fetch user info from Google
          const userInfoResponse = await fetch(
            `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.accessToken}`
          );
          const userInfo = await userInfoResponse.json();

          const userData: User = {
            id: userInfo.id,
            name: userInfo.name,
            email: userInfo.email,
            picture: userInfo.picture,
          };

          setUser(userData);
          await AsyncStorage.setItem('user', JSON.stringify(userData));
          await AsyncStorage.setItem('accessToken', tokenResponse.accessToken);
        }
      } catch (error) {
        console.error('Error handling auth response:', error);
      }
    }
  };

  const signIn = async () => {
    try {
      await promptAsync();
    } catch (error) {
      console.error('Error signing in:', error);
    }
  };

  const signOut = async () => {
    try {
      await AsyncStorage.removeItem('user');
      await AsyncStorage.removeItem('accessToken');
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 