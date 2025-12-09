const User = require('../models/User');

// @desc    Get admin settings
// @route   GET /api/settings
// @access  Private
exports.getSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        notifications: user.notifications
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update admin settings
// @route   PUT /api/settings
// @access  Private
exports.updateSettings = async (req, res, next) => {
  try {
    const { name, email, notifications } = req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (notifications) updateData.notifications = notifications;

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true
    });

    res.status(200).json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        notifications: user.notifications
      }
    });
  } catch (err) {
    next(err);
  }
};
