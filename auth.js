
const passport = require('passport');
const Prisma = require('./db/PrismaClient.js');
const GoogleStrategy = require( 'passport-google-oauth2' ).Strategy;
require('dotenv').config()

const GOOGLE_CLIENT_ID=process.env.GOOGLE_CLIENT_ID
const GOOGLE_CLIENT_SECRET=process.env.GOOGLE_CLIENT_SECRET
passport.use(new GoogleStrategy({
    clientID:     GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/google/callback",
    passReqToCallback   : true
  },
  async function(req, accessToken, refreshToken, profile, done) {
    if(profile.email) {
        // If the email is valid, proceed with the authentication
        console.log('Valid email:', profile.email);
        const user=await Prisma.User.findUnique({
            where: {
                email: profile.email
            }
        });
        if(user){
          profile.uid=user.id
        }  
        done(null, profile);
    }
     else {
     return done(null, false);
  }
  }
));

passport.serializeUser(function(user, done) {
    done(null, {
        displayName: user.displayName,
        email: user.email,
        photos: user.photos,
    });
})

passport.deserializeUser(function(user, done) {
    done(null, {
        displayName: user.displayName,
        email: user.email,
        photos: user.photos,
    });
})