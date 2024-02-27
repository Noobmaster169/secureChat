# Secure Chat

This Smart Contract is A Secure Decentralized Chat Messaging System that is built on Internet Computer (IC) using Azle. The systems allow user to create chat messages with another user, which will be securely stored on the Internet Computer Network.

## Requirements

- [Node.js](https://nodejs.org/en/)
- [IC SDK](https://internetcomputer.org/docs/current/developer-docs/setup/quickstart)

## Installation

Clone The Github Respository
```bash
git clone https://github.com/Noobmaster169/secureChat.git
cd secureChat
```

Install The Dependencies
```bash
npm install
```

Deploy The Canister
```bash
dfx deploy
```

## Methods:

- **createSession**: This method will create a new message session with another user that takes the **Principal ID** of the User.
- **removeSession**: This method will remove your existing session with another user.
- **removeAllSession**: This method will remove all your existing sessions.
- **sendMessage**: This method will send a text message to another user.
- **viewNotifications**: This method will display the notifications of all the unread messages of the user
- **viewMessages**: This method wil display all the existing messages in a session with another user
- **getSessionID**: This method will return the ID of your sesssion with another user.
- **getAllSessions**: This method will return all the user's existing Session IDs.
- **getTotalSessions**: This method will return the total number of sessions a user has.
- **getTotalSessionMessages**: This method will return the total number of sessions a user has.
- **getMaximumSessions**: This method will return the maximum number of sessions a user can create.
- **getMaximumMessages**: This method will return the maximum number of messages a user can send in each session.
