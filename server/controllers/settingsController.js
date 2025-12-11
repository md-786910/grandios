const User = require('../models/User');
const AppSettings = require('../models/AppSettings');

// @desc    Get admin settings
// @route   GET /api/settings
// @access  Private
exports.getSettings = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    const appSettings = await AppSettings.getSettings();

    res.status(200).json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        notifications: user.notifications,
        discount: {
          discountRate: appSettings.discountRate,
          ordersRequiredForDiscount: appSettings.ordersRequiredForDiscount,
          autoCreateDiscount: appSettings.autoCreateDiscount
        }
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
    const { name, email, notifications, discount } = req.body;

    const updateData = {};

    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (notifications) updateData.notifications = notifications;

    const user = await User.findByIdAndUpdate(req.user.id, updateData, {
      new: true,
      runValidators: true
    });

    // Update app settings if discount settings provided
    let appSettings = await AppSettings.getSettings();
    if (discount) {
      appSettings = await AppSettings.updateSettings({
        key: 'default',
        ...(discount.discountRate !== undefined && { discountRate: discount.discountRate }),
        ...(discount.ordersRequiredForDiscount !== undefined && { ordersRequiredForDiscount: discount.ordersRequiredForDiscount }),
        ...(discount.autoCreateDiscount !== undefined && { autoCreateDiscount: discount.autoCreateDiscount })
      });
    }

    res.status(200).json({
      success: true,
      data: {
        name: user.name,
        email: user.email,
        notifications: user.notifications,
        discount: {
          discountRate: appSettings.discountRate,
          ordersRequiredForDiscount: appSettings.ordersRequiredForDiscount,
          autoCreateDiscount: appSettings.autoCreateDiscount
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Get discount settings only
// @route   GET /api/settings/discount
// @access  Private
exports.getDiscountSettings = async (req, res, next) => {
  try {
    const appSettings = await AppSettings.getSettings();

    res.status(200).json({
      success: true,
      data: {
        discountRate: appSettings.discountRate,
        ordersRequiredForDiscount: appSettings.ordersRequiredForDiscount,
        autoCreateDiscount: appSettings.autoCreateDiscount
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update discount settings only
// @route   PUT /api/settings/discount
// @access  Private
exports.updateDiscountSettings = async (req, res, next) => {
  try {
    const { discountRate, ordersRequiredForDiscount, autoCreateDiscount } = req.body;

    const appSettings = await AppSettings.updateSettings({
      key: 'default',
      ...(discountRate !== undefined && { discountRate }),
      ...(ordersRequiredForDiscount !== undefined && { ordersRequiredForDiscount }),
      ...(autoCreateDiscount !== undefined && { autoCreateDiscount })
    });

    res.status(200).json({
      success: true,
      data: {
        discountRate: appSettings.discountRate,
        ordersRequiredForDiscount: appSettings.ordersRequiredForDiscount,
        autoCreateDiscount: appSettings.autoCreateDiscount
      }
    });
  } catch (err) {
    next(err);
  }
};
