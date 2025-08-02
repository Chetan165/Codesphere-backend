const Prisma=require('./db/PrismaClient.js')

const languages={
    54:'C++',
    62:'Java',
    71:'Python'
}

const updateSubmission=async (uid,problemId,ContestId,score,verdict,Code,lang_id)=>{
        try{
            const submissionexists=await Prisma.submission.findFirst({
                where:{
                    userId:uid,
                    problemId:problemId,
                    contestId:ContestId
                }
            })
            if(submissionexists){
                if(score>=submissionexists.score){
                await Prisma.submission.updateMany({
                    where:{
                     id:submissionexists.id
                     
                    },
                    data:{
                        language : languages[lang_id],
                        code :  Code,
                        verdict :verdict,
                        score:score
                    }
                })
            }
            }
            else{
            const updatedSubmission=await Prisma.submission.create({
                data:{
                   userId :uid,       
                   problemId :problemId,
                   contestId :ContestId,
                   code :  Code,
                   verdict :verdict,
                   score : score,
                   language : languages[lang_id],     
                }
            })
        }
        }catch(err){
            console.log(err)
        }
    }

module.exports=updateSubmission