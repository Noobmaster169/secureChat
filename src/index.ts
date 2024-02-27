import {
    bool,
    Canister,
    Err,
    ic,
    nat64,
    Ok,
    Opt,
    Principal,
    query,
    Record,
    Result,
    StableBTreeMap,
    text,
    update,
    Variant,
    Vec,
} from 'azle';

// Maxiumum Default Number for an Integer
const INTEGER_LIMIT = Math.pow(2, 53) -1;
// Maximum Sessions Allowed for Each User
const MAXIMUM_SESSIONS    = 20;
// Maximum Messages Allowed for Each Session
const MAX_MSG_PER_SESSION = 200;

const Message = Record({
    sender      : Principal,
    receiver    : Principal,
    messageText : text,
    messageTime : nat64,
});
type Message = typeof Message.tsType;

const Session = Record({
    id  : nat64,
    user: Principal,
})
type Session = typeof Session.tsType;

const MessageNotification = Record({
    sender: Principal,
    id    : nat64,
    messageTime: nat64,
})
type MessageNotification = typeof MessageNotification.tsType;

const Error = Variant({
    NoManager    : text,
    NoSession    : text,
    NotFound     : text,
    DuplicateAttempt: text,
    MaxSessionsReached: text,
    MaxMessageReached : text,
});


// Store The List of Chat Sessions Each User Has
const userChatIDs = StableBTreeMap<Principal, Vec<Session>>(0);

// Store The Messages Data of Each Chat Session
const chatData    = StableBTreeMap<nat64, Vec<Message>>(1);

// Store The Notifications of Unread Messages of Each User
const unreadMessages = StableBTreeMap<Principal, Vec<MessageNotification>>(2);


export default Canister({
    /**
     *  Create New Session With Another User.
     *  @param  friendPrincipal The Principal ID of the added user in the session
     *  @returns                Successful Status or Error Message
     */
    createSession: update([Principal], Result(bool, Error), (friendPrincipal)=>{
        // Generate New Session ID
        let newID = BigInt(generateRandomID());
        while(chatData.containsKey(newID)){
            newID = BigInt(generateRandomID());
        }
        const newSession: Session = {
            id  : newID,
            user: friendPrincipal,
        } 
        // Add The New Session 
        let userSessions = userChatIDs.get(ic.caller());
        if('None' in userSessions){
            userChatIDs.insert(ic.caller(), [newSession]);
        }else{
            // Check if user still have an available session
            if(userSessions.Some.length > MAXIMUM_SESSIONS){
                return Err({
                    MaxSessionsReached: `Your existing sessions have exceeded the maximum capacity of ${MAXIMUM_SESSIONS} sessions.
                    Please delete some of it to create new session.`
                })
            }
            // Check if a session with the user has existed
            for (const session of userSessions.Some) {
                if (session.user.toString() === friendPrincipal.toString()) {
                    return Err({ DuplicateAttempt: "Session with the Target Principal Has Existed" });
                }
            }
            userSessions.Some.push(newSession);
            userChatIDs.insert(ic.caller(), userSessions.Some);
        }
        // Create The New Session Data
        chatData.insert(newID, []);
        return Ok(true);
    }),

    /**
     *  Remove A Session With Another User.
     *  @param  friendPrincipal The User Principal ID in the Deleted Session
     *  @returns                Success Status or Error Message
     */
    removeSession: update([Principal], Result(bool, Error), (friendPrincipal) =>{
        // Find The Session ID
        let userSessions = userChatIDs.get(ic.caller());
        if('None' in userSessions){
            return Err({NoSession: "You Have No Session Yet."});
        }else{
            // Remove Session With The Selected User
            let removedID = BigInt(0);
            const newSession = userSessions.Some.filter((session) => {
                if(session.user.toString() === friendPrincipal.toString()){
                    removedID = session.id;
                    return false;
                }else{
                    return true;
                }
            });
            if(newSession.length === userSessions.Some.length){
                return Err({NotFound: "Session ID is not found."});
            }
            userChatIDs.insert(ic.caller(), newSession);
            // Remove Session Data if Session Has Been Deleted By Both Users
            const friendSession = userChatIDs.get(friendPrincipal);
            if('None' in friendSession){
                chatData.remove(removedID);  
            }
            else{
                const removedSession : Session = {
                    id: removedID,
                    user: ic.caller(),
                }
                if(!friendSession.Some.includes(removedSession)){
                    chatData.remove(removedID); 
                    //Remove Notifications from Deleted Session
                    let friendNotifications = unreadMessages.get(friendPrincipal);
                    if(!('None' in friendNotifications)){
                        friendNotifications.Some = friendNotifications.Some.filter((notification)=> notification.id !== removedID);
                        unreadMessages.insert(friendPrincipal, friendNotifications.Some);
                    }
                    let userNotifications = unreadMessages.get(ic.caller());
                    if(!('None' in userNotifications)){
                        userNotifications.Some = userNotifications.Some.filter((notification)=> notification.id !== removedID);
                        unreadMessages.insert(ic.caller(), userNotifications.Some);
                    }
                }
            }
            return Ok(true);
        }
    }),

    /**
     *  Remove All Existing Sessions.
     *  @returns   Success Status or Error Message
     */
    removeAllSessions: update([], Result(bool, Error), ()=>{
        let userSessions = userChatIDs.get(ic.caller());
        if('None' in userSessions){
            return Err({NoSession: "You Have No Session Yet."});
        }else{
            for (const session of userSessions.Some) {
                // Remove Session Data if Session Has Been Deleted By Both Users
                const friendSession = userChatIDs.get(session.user);
                if('None' in friendSession){
                    chatData.remove(session.id);  
                }
                else{
                    const removedSession : Session = {
                        id  : session.id,
                        user: ic.caller(),
                    }
                    if(!friendSession.Some.includes(removedSession)){
                        chatData.remove(session.id);
                        //Remove Notifications from Existing Sessions
                        let friendNotifications = unreadMessages.get(session.user);
                        if(!('None' in friendNotifications)){
                            friendNotifications.Some = friendNotifications.Some.filter((notification)=> notification.id !== session.id);
                            unreadMessages.insert(session.user, friendNotifications.Some)
                        } 
                        let userNotifications = unreadMessages.get(ic.caller());
                        if(!('None' in userNotifications)){
                            userNotifications.Some = userNotifications.Some.filter((notification)=> notification.id !== session.id);
                            unreadMessages.insert(ic.caller(), userNotifications.Some);
                        }
                    }
                }
            }
            // Remove All User's Sessions
            userChatIDs.insert(ic.caller(), []);
            return Ok(true);
        }
    }),

    /**
     *  Send A Message To Another User.
     *  @param  receiver The Principal ID of the Messaged User
     *  @param  message  The Sent Message to the User
     *  @returns         Success Status or Error Message
     */
    sendMessage: update([Principal, text], Result(bool, Error), (receiver, message)=>{
        // Find The Session ID
        let userSessions = userChatIDs.get(ic.caller());
        let ID = BigInt(0);
        if('None' in userSessions){
            return Err({NoSession: "You Have No Session Yet."})
        }else{
            userSessions.Some.forEach((session)=>{
                if(session.user.toString() === receiver.toString()){
                    ID = session.id;
                }
            })
            if(ID === BigInt(0)){
                return Err({NotFound: "Session ID Not Detected. Please Create A Session With The Receiver First."})
            }
        }
        // Update The Message
        const newMessage : Message = {
            sender      : ic.caller(),
            receiver    : receiver,
            messageText : message,
            messageTime : ic.time(),
        }
        let currentMessages = chatData.get(ID);
        if('None' in currentMessages){
            chatData.insert(ID, [newMessage])
        }else{
            // Check If Sending Message Is Still Allowed In The Session
            if(currentMessages.Some.length > MAX_MSG_PER_SESSION){
                return Err({
                    MaxMessageReached: `Your session have exceeded the maximum capacity of ${MAX_MSG_PER_SESSION} messages.
                    Please delete this session and create a new one.`
                })
            }
            currentMessages.Some.push(newMessage);
            chatData.insert(ID, currentMessages.Some);
        }
        // Generate New Message Notification to Receiver
        const newNotification: MessageNotification = {
            sender: ic.caller(),
            id    : ID,
            messageTime: ic.time(),
        }
        let currentNotification = unreadMessages.get(receiver);
        if('None' in currentNotification){
            unreadMessages.insert(receiver, [newNotification]);
        }else{
            currentNotification.Some.push(newNotification);
            unreadMessages.insert(receiver, currentNotification.Some);
        }
        return Ok(true);
    }),

    /**
     *  View The Notifications of All Unread Messages
     *  @returns  A Vec of Notifications From All Unread Messages
     */
    viewNotifications: update([], Vec(MessageNotification), ()=>{
        const currentNotifications = unreadMessages.get(ic.caller());
        if('None' in currentNotifications){
            return [];
        }
        else{
            return currentNotifications.Some;
        }
    }),

    /**
     *  View All Messages in A Session with Another User
     *  @param  friendPrincipal The Principal ID of the User in The Session
     *  @returns                Vec of All Messages History or Error Status
     */
    viewMessages: update([Principal], Result(Vec(Message), Error), (friendPrincipal)=>{
        let userSessions = userChatIDs.get(ic.caller());
        let ID = BigInt(0);
        if('None' in userSessions){
            return Err({NoSession: "You Have No Session Yet."})
        }else{
            userSessions.Some.forEach((session)=>{
                if(session.user.toString() === friendPrincipal.toString()){
                    ID = session.id;
                }
            })
            if(ID === BigInt(0)){
                return Err({NotFound:"Session ID is not found."})
            }
        }
        const currentMessages = chatData.get(ID);
        if('None' in currentMessages){
            return Err({NotFound:"Session ID is not found."})
        }
        else{
            // Remove The Unread Message Notification
            const currentNotifications = unreadMessages.get(ic.caller());
            if('None' in currentNotifications){}
            else{
                const updatedNotifications = currentNotifications.Some.filter(notification => notification.id !== ID);
                unreadMessages.insert(ic.caller(), updatedNotifications);
            }
            //Return The Existing Messages
            return Ok(currentMessages.Some);
        }
    }),

    /**
     *  Get The ID of A Session with Another User
     *  @param  friendPrincipal The Principal ID of the User in The Session
     *  @returns                Nat64 of The Session Message ID or Error Status
     */
    getSessionID: query([Principal], Result(nat64, Error), (friendPrincipal)=>{
        let userSessions = userChatIDs.get(ic.caller());
        if('None' in userSessions){
            return Err({NoSession: "You Have No Session Yet."});
        }else{
            for (const session of userSessions.Some) {
                if(session.user.toString() === friendPrincipal.toString()){
                    return Ok(session.id);
                }
            }
            return Err({NotFound: "Session ID is not found"});
        }
    }),

    /**
     *  Get All The Existing Sessions of A User
     *  @returns   Vec of All Sessions the User has
     */
    getAllSessions: query([], Result(Vec(Session), Error), ()=>{
        let userSessions = userChatIDs.get(ic.caller());
        if('None' in userSessions){
            return Err({NoSession: "You Have No Session Yet."});
        }else{
            return Ok(userSessions.Some);
        }
    }),

    /**
     *  Get the Total Number of Existing Sessions of A User
     *  @returns   Nat64 of The Number of Existing Sessions The User Has.
     */
    getTotalSessions: query([], nat64, ()=>{
        let userSessions = userChatIDs.get(ic.caller());
        if('None' in userSessions){
            return BigInt(0);
        }else{
            return BigInt(userSessions.Some.length);
        }
    }),

    /**
     *  Get the Total Number of Messages in An Existing Session
     *  @param  friendPrincipal The Principal ID of the User in The Session
     *  @returns                Nat64 of The Total Number of Messages in The Session or An Error Message
     */
    getTotalSessionMessages: query ([Principal], Result(nat64, Error), (friendPrincipal)=>{
        let userSessions = userChatIDs.get(ic.caller());
        let ID = BigInt(0);
        if('None' in userSessions){
            return Err({NoSession: "You Have No Session Yet."})
        }else{
            userSessions.Some.forEach((session)=>{
                if(session.user.toString() === friendPrincipal.toString()){
                    ID = session.id;
                }
            })
            if(ID === BigInt(0)){
                return Err({NotFound: "Session ID Not Detected. Please Create A Session With The Receiver First."})
            }
        }
        let currentMessages = chatData.get(ID);
        if('None' in currentMessages){
            return Err({NotFound:"Session ID is not found."});
        }else{
            return Ok(BigInt(currentMessages.Some.length));
        }
    }),

    /**
     *  Get The Maximum Sessions Allowed For Each User
     *  @returns   Nat64 of The Maximum Sessions Allowed
     */
    getMaximumSessions: query([], nat64, ()=>{
        return BigInt(MAXIMUM_SESSIONS);
    }),

    /**
     *  Get The Maximum Messages Allowed in Each Session
     *  @returns   Nat64 of The Maximum Messages Allowed in Each Session
     */
    getMaximumMessages: query([], nat64, ()=>{
        return BigInt(MAX_MSG_PER_SESSION);
    }),
})

/**
 *  Generate A Random Session ID
 *  @returns   A Randomly Generated Session ID
 */
function generateRandomID(){
    return Math.floor(Math.random() * INTEGER_LIMIT);
}