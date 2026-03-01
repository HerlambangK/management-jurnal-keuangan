const express = require('express');
const router = express.Router();
const AuthController = require('./auth.controller');
const asyncErrorHandler = require('../../errors/asyncErrorHandler');
const {
    registerValidator,
    loginValidator,
    updateProfileValidator,
    sessionsQueryValidator,
    sessionIdParamValidator,
} = require('./auth.validator');
const validateRequest = require('../../middlewares/validation.middleware');
const authJWT = require('../../middlewares/auth.middleware');

router.post('/register', 
    registerValidator,
    validateRequest,
    asyncErrorHandler(AuthController.register.bind(AuthController))
);

router.post('/login', 
    loginValidator,
    validateRequest,
    asyncErrorHandler(AuthController.login.bind(AuthController))
);

router.get('/profile', 
    authJWT,
    asyncErrorHandler(AuthController.profile.bind(AuthController))
);

router.put(
    '/profile',
    authJWT,
    updateProfileValidator,
    validateRequest,
    asyncErrorHandler(AuthController.updateProfile.bind(AuthController))
);

router.get(
    '/sessions',
    authJWT,
    sessionsQueryValidator,
    validateRequest,
    asyncErrorHandler(AuthController.sessions.bind(AuthController))
);

router.delete(
    '/sessions',
    authJWT,
    asyncErrorHandler(AuthController.clearSessions.bind(AuthController))
);

router.delete(
    '/sessions/:sessionId',
    authJWT,
    sessionIdParamValidator,
    validateRequest,
    asyncErrorHandler(AuthController.deleteSession.bind(AuthController))
);

module.exports = router;
