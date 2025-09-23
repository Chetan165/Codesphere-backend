const express = require('express');
const passport = require('passport');
const session = require('express-session');
const cors = require('cors');
const Prisma = require('./db/PrismaClient.js');
const TestcaseRouter=require('./TestcaseRoute.js')
const SubmissionRouter=require('./SubmissionRoute.js')
const updatedSubmission=require('./UpdateSubmission.js')
require('./auth')
require('dotenv').config()

const app=express();

app.use(cors({
  origin: 'http://localhost:5173', // your frontend
  credentials: true, // allow cookies to be sent
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret:process.env.secret,
    cookie: {
    secure: false, // only true if using HTTPS
    sameSite: 'lax', // or 'none' with secure: true
  }
}))
app.use(passport.initialize());
app.use(passport.session());


function isloggedin(req,res,next){
    if(req.user){
        // console.log(req.user);
        return next();
    }
    res.json({
        ok: false,
        message: 'Not authenticated'
    })
}

app.get('/', (req, res) => {
    res.send('<body><a href="/auth/google">Authenticate</a></body>');
})

app.get('/protected', isloggedin,(req, res) => {
    res.redirect('http://localhost:5173/Dashboard');
})

app.get('/auth/google', 
    passport.authenticate('google',{scope:['email','profile']})
)

app.get('/google/callback',
    passport.authenticate('google',{
        failureRedirect:'/auth/failure'
    }),
    (req,res)=>{
      if(req.user.uid) {
        // else if is authenticated, redirect to protected route
        console.log(req.user.uid)
        res.redirect('/protected');
      } else {
        // If uid doesnt exists, redirect to register page
        res.redirect('http://localhost:5173/Register');
      }
    }
)


app.get('/auth/failure', (req, res) => {
    res.send(`<body>
      <h1>Use a valid @tcetmumbai.in email id to register</h1>
      <a href="/auth/google">Try again</a>
      </body>`);
})
app.get('/api/user',isloggedin, async (req, res) => {
  if (req.user) {
    const uid= await Prisma.user.findUnique({
      where: {
        email: req.user.email
      },
    })
    if(!uid){
       res.json(req.user)
       return
      }
    console.log(uid)
    req.user.uid = uid.id;
    req.user.admin=uid.Admin // Attach user ID to the session user object
    res.json(req.user); // Returns session-stored user
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/register', async (req, res) => {
  // console.log(req.body);
  const {name, roll,yearStart,branch,section,uid } = req.body;

  try {
    const check= await Prisma.User.findMany({
      where: {
        id: uid,
      },
    })
    if(check.length>0) {
      return res.status(400).json({
        ok:false
      }) ;
    }
    else{
    const user = await Prisma.User.create({
      data: {
        id: uid,
        email: req.user.email,
        name: name,
        rollNo: roll,
        branch: branch,
        year: parseInt(yearStart),
      }
    });
    // console.log(user)
    res.status(201).json({
      ok: true,
    })
  }
  } catch (err) {
    console.error(err);
    res.status(500).send('Registration failed');
  }
});

app.get('/logout', (req, res) => {
  req.logout(function(err) {
    if (err) {
      console.error(err);
      return res.status(500).send('Logout error');
    }

    // Destroy session and clear cookie
    req.session.destroy(() => {
      res.clearCookie('connect.sid'); // This is the default session cookie name
      res.json({ok:true})
    });
  });
});



app.listen(3000, () => {
    console.log('Server is running on port 3000');
})
//contest-requests
app.post('/admin/contest', async (req, res) => {
  const { SelectedProblems,title, description, startTime, endTime } = req.body;

  try {
    const contest = await Prisma.Contest.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        problems:{
          connect: SelectedProblems.map(pb=>({id:pb.id}))
        }
      }
    });
    res.status(201).json({ 
      ok: true,
      contestId: contest.id,
      message: 'Contest created successfully' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create contest' });
  }
});
//problem-requests
app.post('/admin/contest/problem', async (req, res) => {
  const {title, statement, inputFormat, outputFormat, constraints, sampleInput, sampleOutput, tags } = req.body;

  try {
    const problem = await Prisma.Problem.create({
      data: {
        title,
        statement,
        inputFormat,
        outputFormat,
        constraints,
        sampleInput,
        sampleOutput,
      }
    });
    console.log(problem)
    res.status(201).json({ 
      ok: true,
      problemId: problem.id,
      message: 'Problem created successfully' 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create problem' });
  }
})

app.get('/api/contests',async (req,res)=>{
  try{
  const contests=await Prisma.contest.findMany({
    include:{
      problems:true
    }
  });
  console.log(contests)
  res.json({
    contest:contests,
    ok:true
  })
}
catch(err){
   res.json({ok:false});
}
  })

app.post('/api/problems',async (req,res)=>{
  console.log(req.body)
  try{
    const problems= await Prisma.problem.findMany({
      where:{
        title:{
          contains: req.body.search,
          mode:"insensitive"
        }
      }
    })
    res.json({
      ok:true,
      problems:problems
    })
  }catch(err){
    console.log(err)
    res.json(
      {
        ok:false
      }
    )
  }
})

app.post('/api/ContestChallenges',async (req,res)=>{
  try{
    const Contestid=req.body.problemId;
    const FetchedChallenges=await Prisma.contest.findUnique({
      where:{
        id:Contestid
      },
      include:{
        problems:true
      }
    })
    res.json({
      ok:true,
      collections:FetchedChallenges
    })
  }catch(err){
     res.json({
      ok:false
     }) 
  }
})


app.get('/api/deleteContest/:id',async (req,res)=>{
  const id=req.params.id;
  try{
  const result= await Prisma.Contest.delete({
    where:{
      id:id
    }
  })
  res.json({
    ok:true
  })
}
catch(err)
{
  res.json({
    ok:false
  })
}
})

app.use('/api/upload-testcases',TestcaseRouter);

app.use('/api/Submission/',SubmissionRouter)

app.post('/api/UpdateSubmission',async (req,res)=>{
  const {uid,problemId,ContestId,score,verdict,Code,lang_id}=req.body
  try{
    const result=await updatedSubmission(uid,problemId,ContestId,score,verdict,Code,lang_id)
    res.json({
      ok:true
    })
  }
  catch(err){
    res.json({
      ok:false,
      message:err.message
    })
  }
})

app.post('/api/contests/getTime/:id',async (req,res)=>{
  try{
    const time=req.body.startTime
    const startTime=new Date(time)
    console.log(typeof(time))
    const date=new Date()
    if(date>=startTime){
      res.json({ok:true})
    }
    else
       res.json({ok:false})
  }catch(err){
    res.json({ok:false})
  }
})



