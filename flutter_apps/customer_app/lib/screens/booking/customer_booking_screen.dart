import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import 'package:spa_shared/utils/date_utils.dart';
import '../../bloc/booking/booking_bloc.dart';
import '../../bloc/booking/booking_event.dart';
import '../../bloc/booking/booking_state.dart';
import '../../widgets/branch_card.dart';
import '../../widgets/service_card.dart';
import '../../widgets/staff_card.dart';
import '../../widgets/time_slot_picker.dart';
import '../../widgets/step_indicator.dart';
import '../../widgets/booking_summary.dart';

class CustomerBookingScreen extends StatefulWidget {
  const CustomerBookingScreen({super.key});

  @override
  State<CustomerBookingScreen> createState() => _CustomerBookingScreenState();
}

class _CustomerBookingScreenState extends State<CustomerBookingScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    // Load initial data
    context.read<BookingBloc>().add(const LoadBranchesEvent());
    context.read<BookingBloc>().add(const LoadMyBookingsEvent());
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Đặt lịch',
          style: GoogleFonts.playfairDisplay(
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          indicatorWeight: 3,
          labelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
          unselectedLabelStyle: GoogleFonts.inter(
            fontWeight: FontWeight.normal,
            fontSize: 14,
          ),
          tabs: const [
            Tab(text: 'Đặt mới'),
            Tab(text: 'Lịch hẹn'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: const [
          _NewBookingTab(),
          _MyBookingsTab(),
        ],
      ),
    );
  }
}

// ==========================================
// NEW BOOKING TAB
// ==========================================
class _NewBookingTab extends StatefulWidget {
  const _NewBookingTab();

  @override
  State<_NewBookingTab> createState() => _NewBookingTabState();
}

class _NewBookingTabState extends State<_NewBookingTab> {
  int _currentStep = 0;
  final int _totalSteps = 4;

  // Selected data
  String? _selectedBranchId;
  String? _selectedServiceId;
  String? _selectedStaffId;
  DateTime? _selectedDateTime;

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    // Load services when branch is selected
    _selectedBranchId = null;
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<BookingBloc, BookingState>(
      listener: (context, state) {
        if (state is BookingCreated) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: const Text('Đặt lịch thành công!'),
              backgroundColor: AppColors.success,
              behavior: SnackBarBehavior.floating,
            ),
          );
          _resetBooking();
        }
        if (state is BookingError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: Colors.red,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      },
      builder: (context, state) {
        return Form(
          key: _formKey,
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Step Indicator
                StepIndicator(
                  currentStep: _currentStep,
                  totalSteps: _totalSteps,
                  labels: const ['Chi nhánh', 'Dịch vụ', 'KTV', 'Thời gian'],
                ),
                const SizedBox(height: 24),

                // Step Content
                if (_currentStep == 0) _buildBranchStep(state),
                if (_currentStep == 1) _buildServiceStep(state),
                if (_currentStep == 2) _buildStaffStep(state),
                if (_currentStep == 3) _buildTimeStep(state),

                const SizedBox(height: 24),

                // Navigation Buttons
                _buildNavigationButtons(state),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBranchStep(BookingState state) {
    final branches = state is BranchesLoaded ? state.branches : <dynamic>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Chọn chi nhánh',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Vui lòng chọn chi nhánh bạn muốn đến',
          style: GoogleFonts.inter(
            color: AppColors.textSecondary,
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 16),

        if (state is BookingLoading)
          const Center(child: LoadingWidget())
        else if (branches.isEmpty)
          const EmptyStateWidget(
            icon: Icons.business,
            title: 'Chưa có chi nhánh',
            message: 'Spa chưa có chi nhánh nào',
          )
        else
          ...branches.map((branch) => BranchCard(
            id: branch.id,
            name: branch.name,
            address: branch.address,
            phone: branch.phone,
            workingHours: branch.workingHours,
            isSelected: _selectedBranchId == branch.id,
            onTap: () {
              setState(() {
                _selectedBranchId = branch.id;
                // Load services for this branch
                context.read<BookingBloc>().add(LoadServicesEvent(branchId: branch.id));
              });
              _goToStep(_currentStep + 1);
            },
          )),
      ],
    );
  }

  Widget _buildServiceStep(BookingState state) {
    final services = state is ServicesLoaded ? state.services : <dynamic>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Chọn dịch vụ',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Chọn dịch vụ bạn muốn trải nghiệm',
          style: GoogleFonts.inter(
            color: AppColors.textSecondary,
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 16),

        if (state is BookingLoading)
          const Center(child: LoadingWidget())
        else if (services.isEmpty)
          const EmptyStateWidget(
            icon: Icons.spa,
            title: 'Chưa có dịch vụ',
            message: 'Spa chưa có dịch vụ nào',
          )
        else
          ...services.map((service) => ServiceCard(
            id: service.id,
            name: service.name,
            price: service.price,
            duration: service.durationMinutes,
            discountPrice: service.discountPrice,
            rating: service.rating,
            imageUrl: service.imageUrl,
            isSelected: _selectedServiceId == service.id,
            onTap: () {
              setState(() {
                _selectedServiceId = service.id;
              });
              _goToStep(_currentStep + 1);
            },
          )),
      ],
    );
  }

  Widget _buildStaffStep(BookingState state) {
    final staff = state is StaffLoaded ? state.staff : <dynamic>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Chọn kỹ thuật viên',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Chọn kỹ thuật viên bạn muốn phục vụ',
          style: GoogleFonts.inter(
            color: AppColors.textSecondary,
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 16),

        if (state is BookingLoading)
          const Center(child: LoadingWidget())
        else if (staff.isEmpty)
          const EmptyStateWidget(
            icon: Icons.person,
            title: 'Chưa có kỹ thuật viên',
            message: 'Spa chưa có kỹ thuật viên nào',
          )
        else
          ...staff.map((staffMember) => StaffCard(
            id: staffMember.id,
            name: staffMember.fullName,
            avatar: staffMember.avatarUrl,
            specialty: staffMember.specialty,
            rating: staffMember.rating,
            isSelected: _selectedStaffId == staffMember.id,
            onTap: () {
              setState(() {
                _selectedStaffId = staffMember.id;
              });
              _goToStep(_currentStep + 1);
            },
          )),
      ],
    );
  }

  Widget _buildTimeStep(BookingState state) {
    final timeSlots = state is TimeSlotsLoaded ? state.timeSlots : <dynamic>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Chọn thời gian',
          style: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 8),
        Text(
          'Chọn ngày và giờ bạn muốn đặt lịch',
          style: GoogleFonts.inter(
            color: AppColors.textSecondary,
            fontSize: 14,
          ),
        ),
        const SizedBox(height: 16),

        // Date picker
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.divider),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Chọn ngày',
                style: TextStyle(fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              _buildDatePicker(),
            ],
          ),
        ),
        const SizedBox(height: 16),

        // Time slots
        if (state is BookingLoading)
          const Center(child: LoadingWidget())
        else if (timeSlots.isEmpty)
          const EmptyStateWidget(
            icon: Icons.access_time,
            title: 'Không có khung giờ trống',
            message: 'Vui lòng chọn ngày khác',
          )
        else
          TimeSlotPicker(
            slots: timeSlots,
            selectedTime: _selectedDateTime,
            onSlotSelected: (dateTime) {
              setState(() {
                _selectedDateTime = dateTime;
              });
            },
          ),

        const SizedBox(height: 16),

        // Booking summary
        if (_selectedDateTime != null && _selectedServiceId != null)
          BookingSummary(
            branchId: _selectedBranchId,
            serviceId: _selectedServiceId,
            staffId: _selectedStaffId,
            dateTime: _selectedDateTime,
            onConfirm: _confirmBooking,
          ),
      ],
    );
  }

  Widget _buildDatePicker() {
    return Container(
      height: 120,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: 14, // 2 weeks
        itemBuilder: (context, index) {
          final date = DateTime.now().add(Duration(days: index));
          final isSelected = _selectedDateTime != null &&
              date.year == _selectedDateTime!.year &&
              date.month == _selectedDateTime!.month &&
              date.day == _selectedDateTime!.day;
          final isToday = date.day == DateTime.now().day &&
              date.month == DateTime.now().month &&
              date.year == DateTime.now().year;

          return GestureDetector(
            onTap: () {
              // Update selected date while preserving time
              final newTime = _selectedDateTime ?? DateTime.now();
              final newDateTime = DateTime(
                date.year,
                date.month,
                date.day,
                newTime.hour,
                newTime.minute,
              );
              setState(() {
                _selectedDateTime = newDateTime;
              });
              // Load time slots for this date
              context.read<BookingBloc>().add(
                LoadTimeSlotsEvent(
                  branchId: _selectedBranchId!,
                  serviceId: _selectedServiceId!,
                  date: date,
                ),
              );
            },
            child: Container(
              width: 60,
              margin: const EdgeInsets.only(right: 8),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primary : Colors.transparent,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: isSelected ? AppColors.primary : AppColors.divider,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    DateFormat('E', 'vi').format(date),
                    style: TextStyle(
                      color: isSelected ? Colors.white : AppColors.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                  Text(
                    '${date.day}',
                    style: TextStyle(
                      color: isSelected ? Colors.white : AppColors.textPrimary,
                      fontWeight: FontWeight.bold,
                      fontSize: 20,
                    ),
                  ),
                  Text(
                    DateFormat('MMM', 'vi').format(date),
                    style: TextStyle(
                      color: isSelected ? Colors.white : AppColors.textSecondary,
                      fontSize: 10,
                    ),
                  ),
                  if (isToday)
                    Container(
                      margin: const EdgeInsets.only(top: 2),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      decoration: BoxDecoration(
                        color: isSelected ? Colors.white : AppColors.primary,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'Hôm nay',
                        style: TextStyle(
                          color: isSelected ? AppColors.primary : Colors.white,
                          fontSize: 8,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildNavigationButtons(BookingState state) {
    final bool isLastStep = _currentStep == _totalSteps - 1;
    final bool isFirstStep = _currentStep == 0;
    final bool canProceed = _canProceedToNext();

    return Row(
      children: [
        if (!isFirstStep)
          Expanded(
            child: OutlinedButton(
              onPressed: () => _goToStep(_currentStep - 1),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('Quay lại'),
            ),
          ),
        if (!isFirstStep) const SizedBox(width: 12),
        Expanded(
          child: ElevatedButton(
            onPressed: isLastStep ? _confirmBooking : () => _goToStep(_currentStep + 1),
            style: ElevatedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            child: Text(
              isLastStep ? 'Đặt lịch ngay' : 'Tiếp tục',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
          ),
        ),
      ],
    );
  }

  bool _canProceedToNext() {
    switch (_currentStep) {
      case 0:
        return _selectedBranchId != null;
      case 1:
        return _selectedServiceId != null;
      case 2:
        return true; // Staff is optional
      case 3:
        return _selectedDateTime != null;
      default:
        return false;
    }
  }

  void _goToStep(int step) {
    if (step < 0) step = 0;
    if (step >= _totalSteps) step = _totalSteps - 1;

    setState(() {
      _currentStep = step;
    });

    // Scroll to top
    if (_currentStep > 0) {
      Scrollable.ensureVisible(
        context,
        duration: const Duration(milliseconds: 300),
      );
    }
  }

  void _confirmBooking() {
    if (_selectedBranchId == null || _selectedServiceId == null || _selectedDateTime == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Vui lòng chọn đầy đủ thông tin'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    context.read<BookingBloc>().add(
      CreateBookingEvent(
        branchId: _selectedBranchId!,
        serviceId: _selectedServiceId!,
        staffId: _selectedStaffId,
        dateTime: _selectedDateTime!,
      ),
    );
  }

  void _resetBooking() {
    setState(() {
      _currentStep = 0;
      _selectedBranchId = null;
      _selectedServiceId = null;
      _selectedStaffId = null;
      _selectedDateTime = null;
    });
  }
}

// ==========================================
// MY BOOKINGS TAB
// ==========================================
class _MyBookingsTab extends StatelessWidget {
  const _MyBookingsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BookingBloc, BookingState>(
      builder: (context, state) {
        if (state is BookingLoading) {
          return const Center(child: LoadingWidget());
        }

        if (state is MyBookingsLoaded) {
          if (state.bookings.isEmpty) {
            return const EmptyStateWidget(
              icon: Icons.calendar_today,
              title: 'Chưa có lịch hẹn',
              message: 'Đặt lịch để trải nghiệm dịch vụ tại Spa',
              actionLabel: 'Đặt lịch ngay',
              onAction: _navigateToNewBooking,
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: state.bookings.length,
            itemBuilder: (context, index) {
              final booking = state.bookings[index];
              return _BookingCard(booking: booking);
            },
          );
        }

        if (state is BookingError) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                Text(
                  state.message,
                  style: GoogleFonts.inter(
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 16),
                ElevatedButton(
                  onPressed: () {
                    context.read<BookingBloc>().add(const LoadMyBookingsEvent());
                  },
                  child: const Text('Thử lại'),
                ),
              ],
            ),
          );
        }

        return const Center(child: LoadingWidget());
      },
    );
  }

  static void _navigateToNewBooking(BuildContext context) {
    // Switch to New Booking tab
    final tabController = DefaultTabController.of(context);
    if (tabController != null) {
      tabController.animateTo(0);
    }
  }
}

// ==========================================
// BOOKING CARD
// ==========================================
class _BookingCard extends StatelessWidget {
  final dynamic booking;

  const _BookingCard({required this.booking});

  @override
  Widget build(BuildContext context) {
    final statusColor = _getStatusColor(booking.status);
    final statusLabel = _getStatusLabel(booking.status);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.divider),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.03),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                booking.serviceName ?? 'Dịch vụ',
                style: GoogleFonts.inter(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  statusLabel,
                  style: TextStyle(
                    color: statusColor,
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              const Icon(Icons.calendar_today, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                DateFormat('EEEE, dd/MM/yyyy', 'vi').format(booking.startTime),
                style: GoogleFonts.inter(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
              const SizedBox(width: 16),
              const Icon(Icons.access_time, size: 14, color: AppColors.textSecondary),
              const SizedBox(width: 6),
              Text(
                DateFormat('HH:mm').format(booking.startTime),
                style: GoogleFonts.inter(
                  color: AppColors.textSecondary,
                  fontSize: 13,
                ),
              ),
            ],
          ),
          if (booking.branchName != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.location_on, size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 6),
                Text(
                  booking.branchName,
                  style: GoogleFonts.inter(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ],
          if (booking.staffName != null) ...[
            const SizedBox(height: 4),
            Row(
              children: [
                const Icon(Icons.person, size: 14, color: AppColors.textSecondary),
                const SizedBox(width: 6),
                Text(
                  booking.staffName,
                  style: GoogleFonts.inter(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ],
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              if (booking.status == 'pending')
                TextButton(
                  onPressed: () {
                    // Cancel booking
                    _showCancelDialog(context, booking.id);
                  },
                  child: const Text('Hủy lịch'),
                ),
              if (booking.status == 'completed')
                TextButton(
                  onPressed: () {
                    // Navigate to review
                  },
                  child: const Text('Đánh giá'),
                ),
              TextButton(
                onPressed: () {
                  // View detail
                },
                child: const Text('Xem chi tiết'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'pending': return Colors.orange;
      case 'confirmed': return AppColors.primary;
      case 'in_progress': return Colors.blue;
      case 'completed': return AppColors.success;
      case 'cancelled': return Colors.red;
      case 'no_show': return Colors.grey;
      default: return AppColors.textSecondary;
    }
  }

  String _getStatusLabel(String status) {
    switch (status) {
      case 'pending': return 'Chờ xác nhận';
      case 'confirmed': return 'Đã xác nhận';
      case 'in_progress': return 'Đang thực hiện';
      case 'completed': return 'Hoàn thành';
      case 'cancelled': return 'Đã hủy';
      case 'no_show': return 'Vắng mặt';
      default: return status;
    }
  }

  void _showCancelDialog(BuildContext context, String bookingId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hủy lịch hẹn'),
        content: const Text('Bạn có chắc chắn muốn hủy lịch hẹn này không?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Đóng'),
          ),
          TextButton(
            onPressed: () {
              Navigator.pop(context);
              context.read<BookingBloc>().add(CancelBookingEvent(bookingId: bookingId));
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hủy lịch'),
          ),
        ],
      ),
    );
  }
}