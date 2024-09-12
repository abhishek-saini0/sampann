class UserController {
    static async signup(req, res) {
        try {
            const existingUser = await User.findOne({ email: req.body.email });
            if (existingUser) {
                return res.status(400).json({ message: 'User already exists, please login or try another email to signup.' });
            }

            const user = new User({
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email,
                mobileNumber: req.body.mobileNumber,
                dateOfBirth: req.body.dateOfBirth,
                gender: req.body.gender,
                religion: req.body.religion,
                profilePhoto: req.file ? req.file.filename : null,
                password: bcrypt.hashSync(req.body.password, 10),
            });

            const otp = otpGenerator.generate(6, { upperCaseAlphabets: false, lowerCaseAlphabets: false, specialChars: false });

            const userOtp = new registrationOtp({
                email: req.body.email,
                otp: otp
            });

            req.session.user = user;
            req.session.save();
            await userOtp.save();

            await transporter.sendMail({
                from: 'abhishek331saini@gmail.com',
                to: req.body.email,
                subject: 'Verification for Sampann Registration',
                html: `Hi ${req.body.firstName} ${req.body.lastName}! Your OTP for verification to register with Sampann is: <b>${otp}</b>. Please don't share it with others.`,
            });

            res.redirect("/signup/otpvarification");
        } catch (error) {
            console.error('Signup error:', error);
            res.status(500).json({ message: error.message || 'Internal server error' });
        }
    }

    static async Otpvarification(req, res) {
        try {
            const userSessionData = req.session.user;
            const userOtp = await registrationOtp.findOne({ email: userSessionData.email }).sort({ created_at: -1 });

            if (userOtp && userOtp.otp === req.body.otp) {
                const userdata = new User(userSessionData);
                await userdata.save();

                const user = await User.findOne({ email: userSessionData.email });

                const tokenPayload = { id: user._id, email: user.email };
                const token = jwt.sign(tokenPayload, process.env.JWT_SECRET_KEY, { expiresIn: '10h' });
                req.session.token = token;
                res.redirect('/profile');
            } else {
                res.status(400).json({ message: 'The entered OTP is incorrect.' });
            }
        } catch (error) {
            console.error('OTP verification error:', error);
            res.status(500).json({ message: error.message || 'Internal server error' });
        }
    }

    static async login(req, res) {
        try {
            const user = await User.findOne({ email: req.body.email });
            if (!user) {
                return res.status(400).json({ message: 'User does not exist. Try another account or register.' });
            }

            const captcha = req.body['g-recaptcha-response'];
            if (!captcha) {
                return res.status(400).json({ message: 'Please complete the CAPTCHA.' });
            }

            const secret_key = process.env.CAPTCHA_SECRET_KEY;
            const captchaResponse = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, null, {
                params: { secret: secret_key, response: captcha },
            });

            if (!captchaResponse.data.success) {
                return res.status(400).json({ message: 'CAPTCHA verification failed. Please try again.' });
            }

            const isValidate = await bcrypt.compare(req.body.password, user.password);
            if (isValidate) {
                const tokenPayload = { id: user._id, email: user.email };
                const token = jwt.sign(tokenPayload, process.env.JWT_SECRET_KEY, { expiresIn: '10h' });
                req.session.token = token;
                res.redirect('/profile');
            } else {
                res.status(400).json({ message: 'Incorrect password' });
            }
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: error.message || 'Internal server error' });
        }
    }

    static async editprofile(req, res) {
        try {
            const token = req.session.token;
            if (!token) {
                return res.status(401).json({ message: 'No token provided' });
            }

            const decodedToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
            const id = decodedToken.id;

            const bio = await Bio.findOne({ user_id: id });
            if (!bio) {
                const userbio = new Bio({ aboutMe: req.body.aboutMe, tagline: req.body.tagline, user_id: id });
                await userbio.save();
            } else {
                await Bio.updateOne({ user_id: id }, { aboutMe: req.body.aboutMe, tagline: req.body.tagline });
            }

            const interests = await Interests.findOne({ user_id: id });
            if (!interests) {
                const userinterests = new Interests({
                    interest1: req.body.interest1,
                    interest2: req.body.interest2,
                    interest3: req.body.interest3,
                    user_id: id,
                });
                await userinterests.save();
            } else {
                await Interests.updateOne(
                    { user_id: id },
                    { interest1: req.body.interest1, interest2: req.body.interest2, interest3: req.body.interest3 }
                );
            }

            const education = await Education.findOne({ user_id: id });
            if (!education) {
                const usereducation = new Education({
                    education: req.body.education,
                    occupation: req.body.occupation,
                    user_id: id,
                });
                await usereducation.save();
            } else {
                await Education.updateOne({ user_id: id }, { education: req.body.education, occupation: req.body.occupation });
            }

            const addresses = await Addresses.findOne({ user_id: id });
            if (!addresses) {
                const useraddresses = new Addresses({
                    street: req.body.street,
                    city: req.body.city,
                    state: req.body.state,
                    postal_code: req.body.postalCode,
                    country: req.body.country,
                    user_id: id,
                });
                await useraddresses.save();
            } else {
                await Addresses.updateOne(
                    { user_id: id },
                    { street: req.body.street, city: req.body.city, state: req.body.state, postal_code: req.body.postalCode, country: req.body.country }
                );
            }

            res.redirect('/profile');
        } catch (error) {
            console.error('Error in edit:', error);
            res.status(500).json({ message: error.message || 'Internal server error' });
        }
    }

    static async logout(req, res) {
        req.session.destroy(err => {
            if (err) {
                console.error('Error destroying session:', err);
                return res.status(500).json({ message: 'Error logging out' });
            }
            res.redirect('/sampann');
        });
    }

    static async payment(req, res) {
        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: { name: 'Sampann' },
                        unit_amount: 20220,
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: `${process.env.BASE_URL}/success`,
                cancel_url: `${process.env.BASE_URL}/cancel`,
            });
            res.redirect(session.url);
        } catch (error) {
            console.error('Error creating checkout session:', error);
            res.status(500).json({ message: error.message || 'Internal server error' });
        }
    }

    static async success(req, res) {
        try {
            const token = req.session.token;
            const decodedToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
            const id = decodedToken.id;

            await User.updateOne({ _id: id }, { isVerified: true });

            const user = await User.findOne({ _id: id });
            res.render('paymentsuccess', { user });
        } catch (error) {
            console.error('Error in payment success:', error);
            res.status(500).json({ message: error.message || 'Internal server error' });
        }
    }

    static async cancel(req, res) {
        const token = req.session.token;
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET_KEY);
        const id = decodedToken.id;

        const user = await User.findOne({
            where: { id: id }
        });
        res.render('paymentcancel', {
            user: user || [],
        });
    }
}

module.exports = UserController;
